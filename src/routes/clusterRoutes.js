import express from "express";
import { getClustersWithData } from "../services/clusterService.js";

const router = express.Router();

// Returns the generated clusters, their associated personas, market and cluster metrics, and campaign id (which is hardcoded for now :D )
router.get("/", async (req, res) => {
  try {
    console.log("API: Fetching clusters and metrics...");
    
    // 1. Fetch the full object { clusters, targetMarketMetrics, clusterMetrics, campaignId }
    const result = await getClustersWithData();
    
    // 2. Send response
    // We use "...result" to unpack the object properties straight into the root of the JSON (normally we use data: result, but the frontend expects the result at root)
    res.status(200).json({
      success: true,
      ...result 
    });

  } catch (error) {
    console.error("API Error fetching clusters:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to retrieve clusters", 
      error: error.message 
    });
  }
});

export default router;