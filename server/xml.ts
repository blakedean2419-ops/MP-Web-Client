import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Tag } from "../src/types.js";

export interface TagMapping {
  id: string;
  name?: string;
  path: string;
  unit?: string;
  description?: string;
  min?: number;
  max?: number;
  warning?: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
});

function numeric(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function field(node: Record<string, unknown>, key: string): unknown {
  const actual = Object.keys(node).find(
    (k) =>
      k.replace(/^@_/, "").split(":").at(-1)?.toLowerCase() ===
      key.toLowerCase(),
  );
  return actual ? node[actual] : undefined;
}

function makeTag(
  id: string,
  name: string,
  value: number,
  node: Record<string, unknown>,
  now: number,
): Tag {
  const min = numeric(field(node, "min")) ?? 0;
  const max =
    numeric(field(node, "max")) ??
    Math.max(100, Math.ceil(Math.abs(value) * 1.5));
  const rawQuality = field(node, "quality");
  const quality =
    rawQuality === undefined ||
    ["good", "192", "true", "1"].includes(String(rawQuality).toLowerCase())
      ? "good"
      : "bad";
  return {
    id,
    name,
    value,
    unit: String(field(node, "unit") ?? field(node, "units") ?? ""),
    description: String(field(node, "description") ?? name),
    min,
    max: max > min ? max : min + 1,
    warning: numeric(field(node, "warning")) ?? undefined,
    timestamp: now,
    quality,
  };
}

/** Auto-detect named Tag/Item records or numeric leaves; use explicit mappings for other schemas. */
export function parseTags(
  xml: string,
  mappings?: TagMapping[],
  now = Date.now(),
): Tag[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("DTD and entity declarations are not supported.");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error("The service returned invalid XML.");
  const document: Record<string, unknown> = parser.parse(xml);
  if (mappings) {
    if (
      !Array.isArray(mappings) ||
      mappings.some(
        (mapping) =>
          !mapping ||
          typeof mapping.id !== "string" ||
          !mapping.id.trim() ||
          typeof mapping.path !== "string" ||
          !mapping.path,
      )
    ) {
      throw new Error(
        "Mappings must contain a nonempty ID and XML path for every tag.",
      );
    }
    const tags = mappings.map((mapping) => {
      const value = mapping.path.split(".").reduce<unknown>((node, key) => {
        if (node === null || typeof node !== "object") return undefined;
        return (node as Record<string, unknown>)[key];
      }, document);
      const parsed = numeric(value);
      if (parsed === null)
        throw new Error(
          `Mapping for ${mapping.id} did not resolve to a finite number.`,
        );
      return makeTag(
        mapping.id,
        mapping.name ?? mapping.id,
        parsed,
        { ...mapping },
        now,
      );
    });
    if (!tags.length || new Set(tags.map((t) => t.id)).size !== tags.length)
      throw new Error("Mappings must contain unique, nonempty tag IDs.");
    return tags;
  }
  const tags: Tag[] = [];
  function walk(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}.${index}`));
      return;
    }
    if (!node || typeof node !== "object") {
      const value = numeric(node);
      if (value !== null && path)
        tags.push(makeTag(path, path.split(".").at(-1)!, value, {}, now));
      return;
    }
    const record = node as Record<string, unknown>;
    const name =
      field(record, "name") ?? field(record, "tagName") ?? field(record, "id");
    // LabVIEW array XML repeats Name/Value siblings. Grouped arrays retain their
    // individual order; the array index is the identity when names repeat.
    const container = field(record, "value");
    if (
      typeof name === "string" &&
      container &&
      typeof container === "object" &&
      !Array.isArray(container)
    ) {
      const array = container as Record<string, unknown>;
      const dimension = field(array, "dimSize");
      if (dimension !== undefined) {
        const count = numeric(dimension);
        const rawNames = field(array, "name");
        const rawValues = field(array, "value");
        const names = Array.isArray(rawNames) ? rawNames : [rawNames];
        const values = Array.isArray(rawValues)
          ? rawValues
          : rawValues === undefined
            ? []
            : [rawValues];
        if (
          count === null ||
          !Number.isInteger(count) ||
          count < 0 ||
          count !== values.length ||
          names.length !== values.length
        ) {
          throw new Error(
            "LabVIEW array dimension, names, and values must have matching lengths. Only one-dimensional numeric arrays are supported.",
          );
        }
        values.forEach((raw, index) => {
          const value = numeric(raw);
          if (value === null || typeof names[index] !== "string")
            throw new Error(
              `LabVIEW array element ${index} is not a named finite double.`,
            );
          tags.push(
            makeTag(
              `${name}[${index}]`,
              `${names[index]} [${index}]`,
              value,
              {
                description: `${name} · Element ${index} (zero-based index)`,
              },
              now,
            ),
          );
        });
        return;
      }
    }
    const rawValue = field(record, "value") ?? field(record, "#text");
    const value = numeric(rawValue);
    if (
      name !== undefined &&
      rawValue !== undefined &&
      (typeof rawValue !== "object" || rawValue === null) &&
      value === null
    ) {
      throw new Error("Named tag values must be finite doubles.");
    }
    if (name !== undefined && value !== null) {
      const id = String(field(record, "id") ?? name);
      tags.push(makeTag(id, String(name), value, record, now));
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (!key.startsWith("@_") && !key.startsWith("?") && key !== "#text")
        walk(child, path ? `${path}.${key}` : key);
    }
  }
  walk(document, "");
  if (!tags.length)
    throw new Error(
      "No numeric tags found. Configure XML_TAG_MAP for this service’s XML schema.",
    );
  if (new Set(tags.map((t) => t.id)).size !== tags.length)
    throw new Error(
      "Duplicate tag names found. Configure unique IDs with XML_TAG_MAP.",
    );
  return tags;
}
