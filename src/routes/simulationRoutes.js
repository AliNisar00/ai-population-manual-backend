// src/routes/simulationRoutes.js
import express from "express";
import {
  simulateAdReactions,
  getSimulationStatus,
  analyzeEmotions,
} from "../controllers/simulationController.js";

const router = express.Router();

// POST /simulation - Start a new simulation
router.post("/", simulateAdReactions);

// GET /simulation/:simulationId/status - Get simulation status
router.get("/:simulationId/status", getSimulationStatus);

// POST /simulation/:simulationId/analyze-emotions - Run emotional analysis on existing simulation
router.post("/:simulationId/analyze-emotions", analyzeEmotions);

export default router;
