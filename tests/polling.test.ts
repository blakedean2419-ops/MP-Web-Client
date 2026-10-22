import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { labviewSample, labviewXml } from "../server/labview-sample.js";
import type { Snapshot } from "../src/types.js";

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeout = 12000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await read();
      if (predicate(result)) return result;
    } catch {
      /* startup may still be in progress */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the XML polling workflow.");
}

test(
  "real polling ingests the supplied LabVIEW XML, keeps only live values, reports failure, and recovers",
  { timeout: 20000 },
  async () => {
    let failing = false;
    let changed = false;
    let authenticatedRequests = 0;
    const upstream = createServer((req, res) => {
      assert.equal(req.url, "/WebService1/Random_Number(GET)");
      if (req.headers.authorization === "Bearer test-fixture-only")
        authenticatedRequests++;
      res.setHeader("Content-Type", "application/xml");
      if (failing) {
        res.writeHead(503);
        res.end("<Unavailable/>");
      } else
        res.end(
          labviewXml(changed ? labviewSample.map((n) => n + 1) : labviewSample),
        );
    }).listen(0, "127.0.0.1");
    const portProbe = createServer().listen(0, "127.0.0.1");
    await Promise.all([
      once(upstream, "listening"),
      once(portProbe, "listening"),
    ]);
    const apiPort = (portProbe.address() as AddressInfo).port;
    portProbe.close();
    await once(portProbe, "close");
    const directory = mkdtempSync(`${tmpdir()}/mp-poll-`);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          XML_SERVICE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/WebService1/Random_Number(GET)`,
          XML_SERVICE_AUTHORIZATION: "Bearer test-fixture-only",
          XML_TAG_MAP: "",
          DATA_DIR: directory,
          PORT: String(apiPort),
          HOST: "127.0.0.1",
          POLL_INTERVAL_MS: "500",
        },
      },
    );
    const read = async (): Promise<Snapshot> =>
      fetch(`http://127.0.0.1:${apiPort}/api/snapshot`).then((r) => r.json());
    try {
      const initial = await waitFor(
        read,
        (s) => s.status.connected && s.tags.length === 100,
      );
      assert.equal(initial.status.mode, "xml");
      assert.equal(initial.tags[0].value, labviewSample[0]);
      assert.ok(authenticatedRequests > 0);
      assert.equal(
        (
          await fetch(
            `http://127.0.0.1:${apiPort}/api/history?tag=Array%5B0%5D&from=0`,
          )
        ).status,
        404,
      );
      assert.deepEqual(
        readdirSync(directory),
        [],
        "polling must not create recorded data files",
      );
      failing = true;
      const stale = await waitFor(read, (s) => !s.status.connected);
      assert.equal(stale.status.error, "XML service returned HTTP 503.");
      assert.equal(stale.tags[0].value, labviewSample[0]);
      assert.equal(stale.status.lastSuccess, initial.status.lastSuccess);
      failing = false;
      changed = true;
      const recovered = await waitFor(
        read,
        (s) => s.status.connected && s.tags[0].value === labviewSample[0] + 1,
      );
      assert.equal(recovered.status.error, null);
    } finally {
      child.kill("SIGTERM");
      await once(child, "exit");
      upstream.close();
      await once(upstream, "close");
      rmSync(directory, { recursive: true });
    }
  },
);
