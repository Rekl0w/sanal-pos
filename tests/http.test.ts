import { describe, expect, test } from "vitest";

import { app } from "../src/app";
import { BankCodes } from "../src/domain/banks";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

describe("HTTP API", () => {
  test("health endpoint çalışır", async () => {
    const response = await app.request("/health");
    const json = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  test("banka listesi filtrelenebilir", async () => {
    const response = await app.request("/api/banks?collective_vpos=true");
    const json = (await response.json()) as {
      count: number;
      data: Array<{ collective_vpos: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(json.count).toBeGreaterThan(5);
    expect(
      json.data.every(
        (bank: { collective_vpos: boolean }) => bank.collective_vpos,
      ),
    ).toBe(true);
  });

  test("satış endpoint'i başarılı sonuç döner", async () => {
    const response = await app.request("/api/sale", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auth: sampleAuth(BankCodes.HEPSIPAY),
        request: sampleSaleRequest(),
      }),
    });

    const json = (await response.json()) as {
      ok: boolean;
      data: {
        status: string;
      };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("success");
  });

  test("bin sorgu endpoint'i veri döner", async () => {
    const response = await app.request("/api/query/bin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auth: sampleAuth(),
        request: {
          BIN: "411111",
          amount: 750,
        },
      }),
    });

    const json = (await response.json()) as {
      data: {
        confirm: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(json.data.confirm).toBe(true);
  });

  test("hatalı istek 400 döner", async () => {
    const response = await app.request("/api/refund", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auth: sampleAuth(),
        request: {
          order_number: "ORDER-001",
          refund_amount: 0,
        },
      }),
    });

    const json = (await response.json()) as {
      ok: boolean;
    };

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
