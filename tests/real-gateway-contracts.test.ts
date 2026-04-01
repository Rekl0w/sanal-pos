import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { SanalPosClient } from "../src/client/sanalpos-client";
import { BankCodes } from "../src/domain/banks";
import { ResponseStatus, SaleResponseStatus } from "../src/domain/enums";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

const originalFetch = globalThis.fetch;

const createResponse = (body: string, status = 200, headers?: ResponseInit["headers"]) =>
  new Response(body, { status, headers });

beforeEach(() => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);

    if (url.includes("/api/token")) {
      return createResponse(JSON.stringify({ data: { token: "TOKEN" } }), 200, {
        "content-type": "application/json",
      });
    }

    if (url.includes("/api/paySmart2D")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.invoice_id).toBe("ORDER-001");

      return createResponse(JSON.stringify({
        status_code: "100",
        data: {
          payment_status: "1",
          auth_code: "QNB-AUTH-001",
        },
      }), 200, {
        "content-type": "application/json",
      });
    }

    if (url.includes("/api/refund")) {
      return createResponse(JSON.stringify({ status_code: "100" }), 200, {
        "content-type": "application/json",
      });
    }

    if (url.includes("sanalpos.isbank.com.tr") || url.includes("istest.asseco-see.com.tr")) {
      const body = String(init?.body ?? "");
      expect(body).toContain("DATA=");
      return createResponse(
        "<?xml version=\"1.0\" encoding=\"ISO-8859-9\"?><CC5Response><Response>Approved</Response><TransId>NESTPAY-123</TransId></CC5Response>",
        200,
        { "content-type": "application/xml" },
      );
    }

    if (url.includes("garantibbva.com.tr/VPServlet")) {
      return createResponse(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><GVPSResponse><Transaction><Response><Code>00</Code></Response><RetrefNum>GAR-001</RetrefNum></Transaction></GVPSResponse>",
        200,
        { "content-type": "application/xml" },
      );
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("real gateway contracts", () => {
  test("QNBPay 2D satış gerçek gateway akışından başarı döner", async () => {
    const response = await SanalPosClient.sale(sampleSaleRequest(), sampleAuth(BankCodes.QNBPAY));

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("QNB-AUTH-001");
  });

  test("QNBPay iade çağrısı gerçek gateway akışında başarılı parse edilir", async () => {
    const response = await SanalPosClient.refund(
      {
        order_number: "ORDER-001",
        transaction_id: "TXN-001",
        refund_amount: 10,
      },
      sampleAuth(BankCodes.QNBPAY),
    );

    expect(response.status).toBe(ResponseStatus.Success);
  });

  test("Nestpay bankası gerçek XML akışından approved parse eder", async () => {
    const response = await SanalPosClient.sale(
      sampleSaleRequest(),
      sampleAuth(BankCodes.IS_BANKASI, {
        merchant_id: "7000679",
        merchant_user: "ISBANKAPI",
        merchant_password: "secret",
        merchant_storekey: "storekey",
      }),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("NESTPAY-123");
  });

  test("Garanti XML satış yanıtı gerçek gateway tarafından başarıya çevrilir", async () => {
    const response = await SanalPosClient.sale(
      sampleSaleRequest(),
      sampleAuth(BankCodes.GARANTI_BBVA, {
        merchant_id: "7000679",
        merchant_user: "30691297",
        merchant_password: "123qweASD/",
        merchant_storekey: "12345678",
      }),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("GAR-001");
  });
});
