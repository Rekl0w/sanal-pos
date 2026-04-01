import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { CurrencyMap } from "../domain/enums";

export const formatAmount = (amount: number): string => amount.toFixed(2);

export const toKurus = (amount: number): string =>
  formatAmount(amount).replace(/[.,]/g, "");

export const sha1Base64 = (value: string): string =>
  createHash("sha1").update(value).digest("base64");

export const sha512Base64 = (value: string): string =>
  createHash("sha512").update(value).digest("base64");

export const hmacSha512Base64 = (value: string, key: string): string =>
  createHmac("sha512", key).update(value).digest("base64");

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const sha1Hex = (value: string): string =>
  createHash("sha1").update(value).digest("hex");

export const sha512HexUpper = (value: string): string =>
  createHash("sha512").update(value).digest("hex").toUpperCase();

export const hmacSha512Base64FromRawKey = (
  value: string,
  key: Uint8Array,
): string => createHmac("sha512", key).update(value).digest("base64");

export const randomHex = (length: number): string => {
  const bytes = randomBytes(length);
  let result = "";

  for (const byte of bytes) {
    result += (byte % 16).toString(16).toUpperCase();
  }

  return result;
};

export const guid = (): string => randomUUID();

export const parseSemicolonResponse = (
  response: string,
): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const part of response.split(";;").filter(Boolean)) {
    const [key, ...rest] = part.split("=");
    if (key && rest.length > 0) {
      result[key] = rest.join("=");
    }
  }

  return result;
};

export const getFormParams = (html: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const regex =
    /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;

  for (const match of html.matchAll(regex)) {
    const [, name, value] = match;
    if (name && !(name in result)) {
      result[name] = value ?? "";
    }
  }

  return result;
};

export const clearNumber = (value: string | undefined): string =>
  (value ?? "").replace(/\D/g, "");

export const detectCardType = (cardNumber: string): string => {
  const cleaned = clearNumber(cardNumber);
  const first2 = cleaned.slice(0, 2);
  const first4 = Number(cleaned.slice(0, 4));

  if (cleaned.startsWith("4")) {
    return "Visa";
  }

  if (
    ["51", "52", "53", "54", "55"].includes(first2) ||
    (first4 >= 2221 && first4 <= 2720)
  ) {
    return "MasterCard";
  }

  if (["34", "37"].includes(first2)) {
    return "AmericanExpress";
  }

  if (first2 === "65" || cleaned.startsWith("9792")) {
    return "Troy";
  }

  return "Unknown";
};

export const ykbCurrencyCode = (currency: number = CurrencyMap.TRY): string => {
  switch (currency) {
    case CurrencyMap.USD:
      return "US";
    case CurrencyMap.EUR:
      return "EU";
    case CurrencyMap.GBP:
      return "GB";
    case CurrencyMap.TRY:
    default:
      return "TL";
  }
};

export const currencyNumericString = (
  currency: number = CurrencyMap.TRY,
): string => String(currency);

export const currencyPaddedString = (
  currency: number = CurrencyMap.TRY,
): string => String(currency).padStart(4, "0");

export const currencyName = (currency: number = CurrencyMap.TRY): string => {
  const match = Object.entries(CurrencyMap).find(
    ([, value]) => value === currency,
  );
  return match?.[0] ?? "TRY";
};

export const base64UrlEncode = (input: string | Uint8Array): string => {
  const buffer =
    typeof input === "string" ? Buffer.from(input) : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const base64UrlDecode = (input: string): Buffer => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
};
