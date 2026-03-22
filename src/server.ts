import { Hono } from "hono";
import { getDatabase } from "./db/index.js";

export const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Only start the server when not in test mode
if (process.env["NODE_ENV"] !== "test") {
  getDatabase();
  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  console.log(`Spine server listening on port ${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
  });
}
