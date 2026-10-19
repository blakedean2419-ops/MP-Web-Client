import express from "express";
import type { Store } from "./store.js";
import type { Status } from "../src/types.js";

export function createApp(
  store: Store,
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
  app.get("/api/history", (req, res) => {
    const id = typeof req.query.tag === "string" ? req.query.tag : "";
    const from = Number(req.query.from);
    const to = req.query.to === undefined ? Date.now() : Number(req.query.to);
    if (
      !id ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to < from ||
      to - from > 31 * 86400000
    ) {
      res
        .status(400)
        .json({
          error:
            "Provide tag, from and to (Unix milliseconds), spanning at most 31 days.",
        });
      return;
    }
    if (!store.tags().some((tag) => tag.id === id)) {
      res.status(404).json({ error: "Unknown tag." });
      return;
    }
    res.json({ tag: id, samples: store.history(id, from, to) });
  });
  return app;
}
