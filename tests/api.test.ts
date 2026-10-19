import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { parseTags } from "../server/xml.js";
import { labviewXml } from "../server/labview-sample.js";

test("snapshot and history APIs return real stored tags; reject malformed ranges and missing tags", async () => {
  const store = new Store(":memory:");
  store.write(parseTags(labviewXml(), undefined, 1000));
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
    const history = await fetch(
      `${base}/api/history?tag=Array%5B0%5D&from=0&to=2000`,
    ).then((r) => r.json());
    assert.equal(history.samples[0].value, 8.644872989293326);
    assert.equal(
      (await fetch(`${base}/api/history?tag=Array%5B0%5D&from=bad`)).status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/history?tag=Array%5B0%5D&from=2000&to=0`))
        .status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/history?tag=missing&from=0&to=2000`)).status,
      404,
    );
  } finally {
    server.close();
    await once(server, "close");
    store.close();
  }
});
