import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { config } from "dotenv";
import clusterRoutes from "./src/routes/clusterRoutes.js";
import simulationRoutes from "./src/routes/simulationRoutes.js";
import personaChatRoutes from "./src/routes/personaChatRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";

config();
const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Health Check Route
app.get("/", (req, res) => {
  res.send("ClueAI Population Backend is running...");
});

app.use("/auth", authRoutes);
app.use("/clusters", clusterRoutes);
app.use("/simulation", simulationRoutes);
app.use("/persona_chat", personaChatRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));