import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

dotenv.config();

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.7,
  maxOutputTokens: 500,
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_TEMPLATE = `
You are a roleplay AI. You must fully embody the specific persona defined below.
Do not break character. Do not act like an AI assistant. Act exactly like the human described.

### DEMOGRAPHICS
Name: {name}
Age: {age}
Gender: {gender}
City: {city} ({region})
Education: {education}
Religion: {religion}
Native Language/s: {languages}
Literacy Level: {literacy}

### BACKGROUND
{description}

### PSYCHOGRAPHICS & TONE
- Emotional Responsiveness: {emotional_responsiveness}
- Temperament: {temperament}
- Communication Style: {communication_style}
- Language Mixing Style: {language_mix} (Mimic this mix in your output)
- Attitude towards Ads: {attitude_towards_ads}

### TRIGGERS
- Things that make you happy: {positive_triggers}
- Things that make you angry/annoyed: {negative_triggers}

Current Context: You are chatting with a stranger online.
`;

const prompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

/**
 * Chat with a single persona
 *
 * @param {Object} params
 * @param {Object} params.persona - Persona object loaded from DB
 * @param {string} params.message - User message
 * @param {Array} params.history - [{ role: "user" | "assistant", content: string }]
 */
export async function chatWithPersona({ persona, message, history = [] }) {
  if (!persona) {
    throw new Error("persona is required");
  }

  if (!message) {
    throw new Error("message is required");
  }

  // Helper to safely inject optional fields
  const safe = (value, fallback = "Not specified") =>
    value !== undefined && value !== null && value !== ""
      ? value
      : fallback;

  const formattedHistory = history.map((msg) =>
    msg.role === "user"
      ? new HumanMessage(msg.content)
      : new AIMessage(msg.content)
  );

  const chain = prompt.pipe(model);

  const response = await chain.invoke({
    input: message,
    chat_history: formattedHistory,

    // Demographics
    name: safe(persona.name),
    age: safe(persona.age),
    gender: safe(persona.gender),
    city: safe(persona.city),
    region: safe(persona.region),
    education: safe(persona.education),
    religion: safe(persona.religion),
    languages: safe(persona.languages),
    literacy: safe(persona.literacy),

    // Background
    description: safe(persona.description),

    // Psychographics
    emotional_responsiveness: safe(persona.emotional_responsiveness),
    temperament: safe(persona.temperament),
    communication_style: safe(persona.communication_style),
    language_mix: safe(persona.language_mix),
    attitude_towards_ads: safe(persona.attitude_towards_ads),

    // Triggers
    positive_triggers: Array.isArray(persona.positive_triggers)
      ? persona.positive_triggers.join(", ")
      : safe(persona.positive_triggers),

    negative_triggers: Array.isArray(persona.negative_triggers)
      ? persona.negative_triggers.join(", ")
      : safe(persona.negative_triggers),
  });

  return {
    personaId: persona.persona_id,
    personaName: persona.name,
    reply: response.content,
  };
}
