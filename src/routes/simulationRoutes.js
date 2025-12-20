import express from "express";

import { simulateAdReactions } from "../controllers/simulationController.js";

const router = express.Router();

// POST /campaigns/initiate
// Starts the multi-agent pipeline (supervisor → targetMarket → clustering)
router.post("/", simulateAdReactions);

export default router;
