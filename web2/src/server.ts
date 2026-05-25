import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import personaRouter from "./routes/persona";
import eventsRouter from "./routes/events";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "dad-space-web2", time: new Date().toISOString(), uptime: process.uptime() });
});

app.use("/persona", personaRouter);
app.use("/events", eventsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

const server = app.listen(PORT, () => {
  console.log(`[System] dAd Space web2 backend running on http://localhost:${PORT}`);
});

// Added: Graceful shutdown pipeline for enterprise readiness
process.on("SIGTERM", () => {
  console.log("[System] SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("[System] Process terminated.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[System] SIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("[System] Process terminated.");
    process.exit(0);
  });
});