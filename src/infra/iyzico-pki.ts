import { createHash, createHmac } from "node:crypto";

import { base64UrlEncode, formatAmount } from "./payment-utils";

export interface IyzicoSerializable {
  toPKIRequestString(): string;
}

export const iyzicoFormatPrice = (amount: number | string): string => {
  const price = typeof amount === "number" ? formatAmount(amount) : amount;

  if (!price.includes(".")) {
    return `${price}.0`;
  }

  let reversed = price.split("").reverse().join("");
  let trimIndex = 0;

  for (let index = 0; index < reversed.length; index += 1) {
    if (reversed[index] === "0") {
      trimIndex = index + 1;
      continue;
    }

    if (reversed[index] === ".") {
      reversed = `0${reversed}`;
    }

    break;
  }

  return reversed.slice(trimIndex).split("").reverse().join("");
};

export const toPKIRequestString = (input: unknown): string => {
  if (input == null) {
    return "[]";
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => toPKIRequestString(item)).join(", ")}]`;
  }

  if (typeof input !== "object") {
    return String(input);
  }

  const parts: string[] = [];

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      parts.push(
        `${key}=[${value.map((item) => toPKIRequestString(item)).join(", ")}]`,
      );
      continue;
    }

    if (typeof value === "object") {
      parts.push(`${key}=${toPKIRequestString(value)}`);
      continue;
    }

    const normalized = /price|paidPrice/i.test(key)
      ? iyzicoFormatPrice(String(value))
      : String(value);
    parts.push(`${key}=${normalized}`);
  }

  return `[${parts.join(",")}]`;
};

export const iyzicoHeaders = (
  apiKey: string,
  secretKey: string,
  request: Record<string, unknown>,
): Record<string, string> => {
  const rnd = `${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}${String(Date.now()).slice(-4)}`;
  const hashInput = `${apiKey}${rnd}${secretKey}${toPKIRequestString(request)}`;
  const hash = createHash("sha1").update(hashInput).digest("base64");
  const authorization = `IYZWS ${apiKey}:${hash}`;

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-iyzi-rnd": rnd,
    "x-iyzi-client-version": "cp-vpos-ts-1.0",
    Authorization: authorization,
  };
};

export const jwtHs512 = (
  kid: string,
  rawKey: Uint8Array,
  payload: Record<string, unknown>,
): string => {
  const header = base64UrlEncode(
    JSON.stringify({ alg: "HS512", typ: "JWT", kidValue: kid }),
  );
  const body = base64UrlEncode(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = createHmac("sha512", rawKey).update(input).digest();
  return `${input}.${base64UrlEncode(signature)}`;
};
