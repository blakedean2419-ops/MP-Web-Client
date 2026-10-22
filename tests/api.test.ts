import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { parseTags } from "../server/xml.js";
import { labviewXml } from "../server/labview-sample.js";

test("snapshot API returns XML tags and historical recording is unavailable", async () => {
  const store = { tags: () => parseTags(labviewXml(), undefined, 1000) };
  const status = {
    mode: "xml" as const,
    connected: true,
    lastSuccess: 1000,
    error: null,
    pollIntervalMs: 2000,
  };
  const server = createApp(store, () => status).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const snapshot = await fetch(`${base}/api/snapshot`).then((r) => r.json());
    assert.equal(snapshot.status.mode, "xml");
    assert.equal(snapshot.tags.length, 100);
    assert.equal(snapshot.tags[0].value, 8.644872989293326);
    assert.equal(
      (await fetch(`${base}/api/history?tag=Array%5B0%5D&from=0&to=2000`))
        .status,
      404,
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});
