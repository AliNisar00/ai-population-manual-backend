import express from "express";
import { getPersonaById } from "../db/personaRepository.js";
import { chatWithPersona } from "../services/personaChatService.js";

const router = express.Router();

router.post("/:personaId", async (req, res) => {
  try {
    const { personaId } = req.params;
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const persona = await getPersonaById(personaId);

    if (!persona) {
      return res.status(404).json({ error: "Persona not found" });
    }

    const result = await chatWithPersona({
    persona,
    message,
    history,
    });

    res.json(result);
  } catch (err) {
    console.error("Persona chat error:", err);
    res.status(500).json({ error: "Failed to generate persona reply" });
  }
});

export default router;
