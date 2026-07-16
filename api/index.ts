import express from "express";
import routes from "../server/routes";

const app = express();
app.use(express.json());

// Mount all API and SSE routes
app.use(routes);

export default app;
