import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTags } from "../server/xml.js";
import { labviewSample, labviewXml } from "../server/labview-sample.js";

test("parses all 100 supplied LabVIEW doubles without treating DimSize as a tag", () => {
  const tags = parseTags(labviewXml(), undefined, 1700000000000);
  assert.equal(labviewSample.length, 100);
  assert.equal(tags.length, 100);
  assert.equal(new Set(tags.map((t) => t.id)).size, 100);
  assert.equal(tags[0].id, "Array[0]");
  assert.equal(tags[99].id, "Array[99]");
  assert.equal(tags[0].name, "Numeric Control [0]");
  assert.deepEqual(
    tags.map((t) => t.value),
    labviewSample,
  );
  assert.ok(tags.every((t) => t.timestamp === 1700000000000));
  assert.equal(tags[19].value, 0.3130383555164951);
});

test("LabVIEW array IDs stay stable when numeric values change", () => {
  assert.deepEqual(
    parseTags(labviewXml()).map((t) => t.id),
    parseTags(labviewXml(labviewSample.map((v) => v + 1))).map((t) => t.id),
  );
});

test("rejects mismatched dimensions and nonfinite LabVIEW values", () => {
  assert.throws(
    () => parseTags(labviewXml().replace("<DimSize>100", "<DimSize>99")),
    /matching lengths/,
  );
  assert.throws(
    () =>
      parseTags(labviewXml().replace("<Value>8.644872989293326", "<Value>NaN")),
    /finite double/,
  );
});

test("reads named attribute tags, child-element tags, units, quality and doubles", () => {
  const tags = parseTags(
    '<Tags><Tag name="Pressure" unit="bar" min="-10" max="10"><Value>-1.123456789012345</Value></Tag><Tag><Name>Flow</Name><Value>1.5e-6</Value><Unit>m3/h</Unit><Quality>Bad</Quality></Tag></Tags>',
  );
  assert.equal(tags[0].value, -1.123456789012345);
  assert.equal(tags[0].unit, "bar");
  assert.equal(tags[0].min, -10);
  assert.equal(tags[1].value, 1.5e-6);
  assert.equal(tags[1].quality, "bad");
});

test("supports numeric leaves and explicit array path mappings", () => {
  assert.equal(
    parseTags("<Process><Pressure>7.25</Pressure></Process>")[0].id,
    "Process.Pressure",
  );
  const tags = parseTags(labviewXml(), [
    {
      id: "Inlet",
      name: "Inlet pressure",
      path: "Response.Terminal.Value.Value.0",
      unit: "bar",
      min: 0,
      max: 10,
    },
  ]);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].value, labviewSample[0]);
  assert.equal(tags[0].unit, "bar");
  assert.equal(tags[0].max, 10);
});

test("rejects malformed XML, duplicate named tags, entities and invalid mappings", () => {
  assert.throws(() => parseTags("<broken>"), /invalid XML/);
  assert.throws(
    () =>
      parseTags(
        '<Tags><Tag name="same" value="1"/><Tag name="same" value="2"/></Tags>',
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      parseTags(
        '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',
      ),
    /DTD/,
  );
  assert.throws(() => parseTags("<x>abc</x>"), /No numeric tags/);
  assert.throws(
    () => parseTags("<x>5</x>", [{ id: "x", path: "missing" }]),
    /finite number/,
  );
  assert.throws(
    () => parseTags('<Tag name="broken" min="0"><Value>NaN</Value></Tag>'),
    /finite doubles/,
  );
  assert.throws(
    () => parseTags("<x>5</x>", [{ id: "", path: "x" }]),
    /nonempty ID/,
  );
});
