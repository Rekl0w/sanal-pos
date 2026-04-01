import { XMLBuilder, XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
  removeNSPrefix: true,
  processEntities: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: false,
  suppressBooleanAttributes: false,
});

export const buildXml = (
  rootTag: string,
  payload: Record<string, unknown>,
  encoding = "UTF-8",
): string => {
  const xml = builder.build({ [rootTag]: payload });
  return `<?xml version="1.0" encoding="${encoding}"?>${xml}`;
};

export const parseXml = (xml: string): Record<string, unknown> => {
  if (!xml.trim()) {
    return {};
  }

  try {
    const parsed = parser.parse(xml);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const findNode = (
  input: unknown,
  key: string,
): Record<string, unknown> | undefined => {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  if (key in (input as Record<string, unknown>)) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const found = findNode(value, key);
    if (found) {
      return found;
    }
  }

  return undefined;
};

export const flattenXmlObject = (
  input: unknown,
  target: Record<string, string> = {},
): Record<string, string> => {
  if (!input || typeof input !== "object") {
    return target;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        flattenXmlObject(item, target);
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      flattenXmlObject(value, target);
      continue;
    }

    target[key] = value == null ? "" : String(value);
  }

  return target;
};
