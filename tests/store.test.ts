import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { parseTags } from "../server/xml.js";
import { labviewXml } from "../server/labview-sample.js";

test("SQLite preserves doubles and history across restarts, excludes bad-quality samples, and prunes", () => {
  const directory = mkdtempSync(join(tmpdir(), "mp-store-"));
  const path = join(directory, "test.sqlite");
  let store = new Store(path);
  try {
    const tags = parseTags(labviewXml(), undefined, 1000);
    store.write(tags);
    store.write([{ ...tags[0], value: 9.123456789012345, timestamp: 2000 }]);
    store.write([{ ...tags[0], value: 1, timestamp: 3000, quality: "bad" }]);
    store.close();
    store = new Store(path);
    assert.equal(store.tags().length, 100);
    assert.deepEqual(
      store
        .tags()
        .slice(0, 4)
        .map((t) => t.id),
      ["Array[0]", "Array[1]", "Array[2]", "Array[3]"],
    );
    assert.equal(store.tags().find((t) => t.id === "Array[0]")?.quality, "bad");
    assert.deepEqual(store.history("Array[0]", 1000, 3000), [
      { timestamp: 1000, value: tags[0].value },
      { timestamp: 2000, value: 9.123456789012345 },
    ]);
    store.prune(1500);
    assert.deepEqual(store.history("Array[0]", 0, 5000), [
      { timestamp: 2000, value: 9.123456789012345 },
    ]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("history reduction retains first/last samples and a short spike", () => {
  const store = new Store(":memory:");
  try {
    const tag = parseTags('<Tag name="test" value="0"/>')[0];
    for (let i = 0; i < 3000; i++)
      store.write([
        { ...tag, timestamp: i, value: i === 1234 ? 1000 : Math.sin(i) },
      ]);
    const samples = store.history("test", 0, 3000);
    assert.ok(samples.length <= 600);
    assert.equal(samples[0].timestamp, 0);
    assert.equal(samples.at(-1)?.timestamp, 2999);
    assert.ok(samples.some((s) => s.timestamp === 1234 && s.value === 1000));
    assert.ok(
      samples.every(
        (s, i) => i === 0 || s.timestamp > samples[i - 1].timestamp,
      ),
    );
  } finally {
    store.close();
  }
});
