import { parseTags } from "./xml.js";
import { labviewSample, labviewXml } from "./labview-sample.js";
import type { Tag } from "../src/types.js";

/** Demonstration only: the supplied 100-element schema with simulated movement. */
export function demoTags(timestamp = Date.now()): Tag[] {
  const values = labviewSample.map((base, index) => {
    const phase = timestamp / 1000;
    return Math.max(
      0,
      Math.min(
        10,
        base +
          0.4 * Math.sin(phase / (15 + index) + index) +
          0.15 * Math.sin(phase / 3 + index),
      ),
    );
  });
  return parseTags(labviewXml(values), undefined, timestamp).map((tag) => ({
    ...tag,
    min: 0,
    max: 10,
  }));
}
