import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import express from "express";
import type { Tag } from "../src/types.js";
import { demoTags } from "./demo.js";
import { parseTags, type TagMapping } from "./xml.js";
import { createApp } from "./app.js";
import type { Status } from "../src/types.js";

if (existsSync(".env")) loadEnvFile(".env");
const serviceUrl = process.env.XML_SERVICE_URL?.trim();
if (serviceUrl && !["http:", "https:"].includes(new URL(serviceUrl).protocol))
  throw new Error("XML_SERVICE_URL must be HTTP or HTTPS.");
const interval = Number(process.env.POLL_INTERVAL_MS || 2000);
if (!Number.isFinite(interval) || interval < 500 || interval > 3600000)
  throw new Error("POLL_INTERVAL_MS must be between 500 and 3600000.");
// Keep only the latest snapshot. No measurement database or historical recording.
let currentTags: Tag[] = [];
const store = {
  tags: () => currentTags,
  write: (tags: Tag[]) => {
    currentTags = tags;
  },
};
const mappings: TagMapping[] | undefined = process.env.XML_TAG_MAP
  ? JSON.parse(readFileSync(process.env.XML_TAG_MAP, "utf8"))
  : undefined;
const status: Status = {
  mode: serviceUrl ? "xml" : "demo",
  connected: false,
  lastSuccess: null,
  error: null,
  pollIntervalMs: interval,
};

let timer: ReturnType<typeof setTimeout> | undefined;
let stopping = false;
async function poll() {
  try {
    if (serviceUrl) {
      const response = await fetch(serviceUrl, {
        headers: {
          Accept: "application/xml, text/xml",
          ...(process.env.XML_SERVICE_AUTHORIZATION
            ? { Authorization: process.env.XML_SERVICE_AUTHORIZATION }
            : {}),
        },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(`XML service returned HTTP ${response.status}.`);
      // Bound the streamed response before allocating/parsing an entire service payload.
      if (!response.body)
        throw new Error("XML service returned an empty response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("XML response exceeds the 2 MB limit.");
        }
        chunks.push(value);
      }
      store.write(parseTags(Buffer.concat(chunks).toString("utf8"), mappings));
    } else store.write(demoTags());
    status.connected = true;
    status.lastSuccess = Date.now();
    status.error = null;
  } catch (error) {
    status.connected = false;
    // Never include upstream URLs, headers, or credentials in API responses/logs.
    status.error =
      error instanceof Error &&
      /^(XML service returned HTTP|XML response exceeds|The service returned invalid XML|No numeric tags found|Duplicate tag names found|Mapping for|Mappings must|LabVIEW array|Named tag values|DTD and entity)/.test(
        error.message,
      )
        ? error.message
        : "Unable to read the XML service. Check connectivity and server configuration.";
    console.error(status.error);
  } finally {
    if (!stopping) timer = setTimeout(poll, interval);
  }
}
await poll();
const app = createApp(store, () => ({ ...status }), process.env.CLIENT_ORIGIN);
if (existsSync("dist/index.html")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () =>
  console.log(`MP API listening on ${host}:${port} (${status.mode} mode)`),
);
function shutdown() {
  stopping = true;
  if (timer) clearTimeout(timer);
  server.close(() => {
    process.exit(0);
  });
  // Bound shutdown if a request is still in flight.
  setTimeout(() => process.exit(0), 12000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
