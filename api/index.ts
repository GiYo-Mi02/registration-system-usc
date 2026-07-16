import express from "express";
import routes from "../server/routes";

const app = express();

// Trust Vercel's reverse proxy so req.ip is correct (required for rate limiting)
app.set("trust proxy", 1);

// Middleware: parse JSON bodies
app.use(express.json());

// Middleware: Set security and browser permission headers for all API responses
app.use((_req, res, next) => {
  // Allow camera access from this origin (required for getUserMedia on HTTPS)
  res.setHeader("Permissions-Policy", "camera=*, microphone=()");
  // CORS: allow the Vercel frontend origin to call the API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Handle CORS pre-flight requests
app.options("*", (_req, res) => {
  res.sendStatus(204);
});

// Mount all API and SSE routes
app.use(routes);

export default app;
