import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { config } from "dotenv";

config();

const API_CONFIGS = [
  {
    type: "groq",
    key: process.env.GROQ_API_KEY_1,
    rpm: 30, // requests per minute
    rpd: 1000, // requests per day
    tpd: 100000, // tokens per day
    model: "llama-3.3-70b-versatile",
  },
  {
    type: "groq",
    key: process.env.GROQ_API_KEY_2,
    rpm: 30,
    rpd: 1000,
    tpd: 100000,
    model: "llama-3.3-70b-versatile",
  },
  {
    type: "groq",
    key: process.env.GROQ_API_KEY_3,
    rpm: 30,
    rpd: 1000,
    tpd: 100000,
    model: "llama-3.3-70b-versatile",
  },
  {
    type: "groq",
    key: process.env.GROQ_API_KEY_4,
    rpm: 30,
    rpd: 1000,
    tpd: 100000,
    model: "llama-3.3-70b-versatile",
  },
  {
    type: "groq",
    key: process.env.GROQ_API_KEY_5,
    rpm: 30,
    rpd: 1000,
    tpd: 100000,
    model: "llama-3.3-70b-versatile",
  },
//   {
//     type: "groq",
//     key: process.env.GROQ_API_KEY_6,
//     rpm: 30,
//     rpd: 1000,
//     tpd: 100000,
//     model: "llama-3.3-70b-versatile",
//   },
  // Fallback to Gemini (high token limit)
  {
    type: "gemini",
    key: process.env.GEMINI_API_KEY,
    rpm: 15,
    rpd: 1500,
    tpd: 1000000,
    model: "gemini-2.5-flash",
  },
];

class APIRotator {
  constructor() {
    this.apis = API_CONFIGS.map((config, index) => ({
      id: index,
      config,
      requestsThisMinute: 0,
      requestsToday: 0,
      tokensToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now(),
      client: this.createClient(config),
      exhausted: false,
    }));
    this.currentIndex = 0;
    
    // Create separate vision client for image analysis
    this.visionClient = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      maxOutputTokens: 2048,
    });
  }

  createClient(config) {
    if (config.type === "groq") {
      return new ChatGroq({
        apiKey: config.key,
        model: config.model,
        temperature: 0.7,
        maxTokens: 512,
      });
    } else if (config.type === "gemini") {
      return new ChatGoogleGenerativeAI({
        apiKey: config.key,
        model: config.model,
        maxOutputTokens: 512,
      });
    }
    throw new Error(`Unknown API type: ${config.type}`);
  }

  resetCountersIfNeeded(api) {
    const now = Date.now();
    
    // Reset minute counter
    if (now - api.lastMinuteReset >= 60000) {
      api.requestsThisMinute = 0;
      api.lastMinuteReset = now;
    }
    
    // Reset day counter
    if (now - api.lastDayReset >= 86400000) {
      api.requestsToday = 0;
      api.tokensToday = 0;
      api.exhausted = false;
      api.lastDayReset = now;
    }
  }

  async getAvailableAPI() {
    const startIndex = this.currentIndex;
    let cycleCount = 0;
    
    while (true) {
      const api = this.apis[this.currentIndex];
      this.resetCountersIfNeeded(api);
      
      // Check if this API has capacity (both requests AND tokens)
      const hasTokenCapacity = !api.config.tpd || api.tokensToday < api.config.tpd * 0.95;
      
      if (
        !api.exhausted &&
        api.requestsThisMinute < api.config.rpm &&
        api.requestsToday < api.config.rpd &&
        hasTokenCapacity
      ) {
        return api;
      }
      
      // Try next API
      this.currentIndex = (this.currentIndex + 1) % this.apis.length;
      cycleCount++;
      
      // If we've cycled through all APIs multiple times
      if (cycleCount >= this.apis.length * 2) {
        console.log("All APIs exhausted or at capacity, waiting 5 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        cycleCount = 0;
      }
    }
  }

  async invoke(messages) {
    const api = await this.getAvailableAPI();
    
    // Increment counters
    api.requestsThisMinute++;
    api.requestsToday++;
    
    console.log(
      `Using API ${api.id} (${api.config.type}): ${api.requestsThisMinute}/${api.config.rpm} RPM, ${api.requestsToday}/${api.config.rpd} RPD, Tokens: ${api.tokensToday}/${api.config.tpd || 'unlimited'}`
    );
    
    try {
      const result = await api.client.invoke(messages);
      
      // Estimate tokens used (rough approximation: 1 token ≈ 4 characters)
      const contentLength = JSON.stringify(messages).length + (result.content?.length || 0);
      const estimatedTokens = Math.ceil(contentLength / 4);
      api.tokensToday += estimatedTokens;
      
      // Add a small delay to smooth out requests
      const delayMs = Math.ceil(60000 / api.config.rpm);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      
      return result;
    } catch (error) {
      console.error(`API ${api.id} error:`, error.message);
      
      // Check if rate limited (requests or tokens)
      if (error.message.includes("rate") || 
          error.message.includes("429") || 
          error.message.includes("tokens per day")) {
        
        // Mark as exhausted if token limit hit
        if (error.message.includes("tokens per day") || error.message.includes("TPD")) {
          api.exhausted = true;
          api.tokensToday = api.config.tpd || Infinity;
          console.log(`API ${api.id} exhausted (token limit), marked as unavailable`);
        } else {
          api.requestsThisMinute = api.config.rpm;
          console.log(`API ${api.id} rate limited (RPM), switching...`);
        }
      }
      
      throw error;
    }
  }

  // Special method for vision tasks (uses Gemini)
  async invokeVision(messages) {
    console.log("Using vision model (Gemini) for image analysis");
    
    try {
      const result = await this.visionClient.invoke(messages);
      return result;
    } catch (error) {
      console.error("Vision model error:", error.message);
      throw error;
    }
  }

  getStatus() {
    return this.apis.map((api) => ({
      id: api.id,
      type: api.config.type,
      model: api.config.model,
      requestsThisMinute: api.requestsThisMinute,
      rpm: api.config.rpm,
      requestsToday: api.requestsToday,
      rpd: api.config.rpd,
      tokensToday: api.tokensToday,
      tpd: api.config.tpd || 'unlimited',
      exhausted: api.exhausted,
    }));
  }
}

// Export singleton instance
export const apiRotator = new APIRotator();
