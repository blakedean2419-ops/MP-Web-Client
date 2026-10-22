import express from "express";
import type { Tag } from "../src/types.js";
import type { Status } from "../src/types.js";

export function createApp(
  store: { tags: () => Tag[] },
  getStatus: () => Status,
  origin?: string,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (origin && req.headers.origin === origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    next();
  });
  app.get("/api/snapshot", (_req, res) =>
    res.json({ tags: store.tags(), status: getStatus() }),
  );
  app.get("/api/health", (_req, res) => res.json({ ok: true, ...getStatus() }));
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API endpoint." }),
  );
  return app;
}
