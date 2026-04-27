import { afterEach, describe, expect, test, vi } from "vitest";

import { BankCodes } from "../src/domain/banks";
import {
  InstallmentCommissionPolicy,
  SaleResponseStatus,
} from "../src/domain/enums";
import { MerchantAuthSchema } from "../src/domain/schemas";
import { HttpClient } from "../src/infra/http-client";
import { BankService } from "../src/services/bank-service";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

const makeInstallmentSaleRequest = (installment: number, is3D = false) => {
  const base = sampleSaleRequest();

  return {
    ...base,
    sale_info: {
      ...base.sale_info,
      installment,
      amount: 100,
    },
    payment_3d: is3D
      ? {
          confirm: true,
          return_url: "https://merchant.example/callback",
        }
      : {
          confirm: false,
        },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commit parity ports", () => {
  test("MerchantAuth şeması komisyon politikasını normalize eder", () => {
    const parsed = MerchantAuthSchema.parse({
      ...sampleAuth(BankCodes.QNBPAY),
      installment_commission_policy: "1",
    });

    expect(parsed.installment_commission_policy).toBe(
      InstallmentCommissionPolicy.ChargeToCustomer,
    );
  });

  test("CCPayment satış isteğine komisyon politikası eklenir", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockImplementation(async (url: string, body: unknown) => {
      if (url.endsWith("/api/token")) {
        return JSON.stringify({ data: { token: "TOKEN" } });
      }

      if (url.endsWith("/api/paySmart2D")) {
        expect((body as Record<string, unknown>).is_comission_from_user).toBe(
          "1",
        );

        return JSON.stringify({
          status_code: "100",
          data: { payment_status: "1", auth_code: "AUTH-1" },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const gateway = BankService.createGateway(BankCodes.QNBPAY);
    const response = await gateway.sale(
      makeInstallmentSaleRequest(3),
      sampleAuth(BankCodes.QNBPAY, {
        installment_commission_policy:
          InstallmentCommissionPolicy.ChargeToCustomer,
      }),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("AUTH-1");
  });

  test("CCPayment 3D isteğinde merchant completion modeli kullanılır", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockImplementation(async (url: string, body: unknown) => {
      if (url.endsWith("/api/token")) {
        return JSON.stringify({ data: { token: "TOKEN" } });
      }

      if (url.endsWith("/api/paySmart3D")) {
        const payload = body as Record<string, unknown>;
        expect(payload.payment_completed_by).toBe("merchant");
        expect(payload.is_comission_from_user).toBe("2");

        return '<form id="3d"></form>';
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const gateway = BankService.createGateway(BankCodes.QNBPAY);
    const response = await gateway.sale(
      makeInstallmentSaleRequest(3, true),
      sampleAuth(BankCodes.QNBPAY, {
        installment_commission_policy:
          InstallmentCommissionPolicy.AbsorbByMerchant,
      }),
    );

    expect(response.status).toBe(SaleResponseStatus.RedirectHTML);
    expect(response.message).toContain("<form");
  });

  test("CCPayment 3D response complete çağrısı yapar ve iki aşamalı private_response döner", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockImplementation(async (url: string, body: unknown) => {
      if (url.endsWith("/api/token")) {
        return JSON.stringify({ data: { token: "TOKEN" } });
      }

      if (url.endsWith("/payment/complete")) {
        expect((body as Record<string, unknown>).status).toBe("complete");

        return JSON.stringify({
          status_code: "100",
          data: { auth_code: "AUTH-3D" },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const gateway = BankService.createGateway(BankCodes.QNBPAY);
    const response = await gateway.sale3DResponse(
      {
        responseArray: {
          invoice_id: "ORDER-1",
          order_id: "ORDER-ID-1",
          md_status: "1",
          hash_key: "",
        },
      },
      sampleAuth(BankCodes.QNBPAY),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("AUTH-3D");
    expect(response.private_response).toHaveProperty("response_1");
    expect(response.private_response).toHaveProperty("response_2");
  });

  test("Sipay complete çağrısına app_lang ekler", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockImplementation(async (url: string, body: unknown) => {
      if (url.endsWith("/api/token")) {
        return JSON.stringify({ data: { token: "TOKEN" } });
      }

      if (url.endsWith("/payment/complete")) {
        expect((body as Record<string, unknown>).app_lang).toBe("tr");

        return JSON.stringify({
          status_code: "100",
          data: { auth_code: "AUTH-SIPAY" },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const gateway = BankService.createGateway(BankCodes.SIPAY);
    const response = await gateway.sale3DResponse(
      {
        responseArray: {
          invoice_id: "ORDER-1",
          order_id: "ORDER-ID-1",
          md_status: "1",
          hash_key: "",
        },
      },
      sampleAuth(BankCodes.SIPAY),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("AUTH-SIPAY");
  });

  test("CCPayment allInstallmentQuery merchant komisyonu üstlenince oranı sıfırlar", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockImplementation(async (url: string, body: unknown) => {
      if (url.endsWith("/api/token")) {
        return JSON.stringify({ data: { token: "TOKEN" } });
      }

      if (url.endsWith("/api/commissions")) {
        expect((body as Record<string, unknown>).is_comission_from_user).toBe(
          "2",
        );

        return JSON.stringify({
          data: [
            {
              card_program: "Bonus",
              installments_number: 3,
              user_commission_percentage: 4.25,
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const gateway = BankService.createGateway(BankCodes.QNBPAY);
    const response = await gateway.allInstallmentQuery(
      {
        amount: 100,
      },
      sampleAuth(BankCodes.QNBPAY, {
        installment_commission_policy:
          InstallmentCommissionPolicy.AbsorbByMerchant,
      }),
    );

    expect(response.confirm).toBe(true);
    expect(response.installments[0]?.installment_list[0]?.rate).toBe(0);
  });

  test("Iyzico 3D response responseArray boşsa anlamlı hata döner", async () => {
    const gateway = BankService.createGateway(BankCodes.IYZICO);
    const response = await gateway.sale3DResponse(
      {
        responseArray: null as never,
      },
      sampleAuth(BankCodes.IYZICO),
    );

    expect(response.status).toBe(SaleResponseStatus.Error);
    expect(response.message).toBe("responseArray boş olamaz");
  });

  test("Iyzico 3D hata akışında response_1 detayını korur", async () => {
    const gateway = BankService.createGateway(BankCodes.IYZICO);
    const response = await gateway.sale3DResponse(
      {
        responseArray: {
          conversationId: "ORDER-1",
          paymentId: "PAY-1",
          status: "failure",
          mdStatus: 7,
        },
      },
      sampleAuth(BankCodes.IYZICO),
    );

    expect(response.status).toBe(SaleResponseStatus.Error);
    expect(response.message).toBe("Sistem hatası");
    expect(response.private_response).toHaveProperty("response_1");
  });

  test("Paynet satış ve 3D charge akışını işler", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");
    const expectedAuth = `Basic ${btoa("merchant-user:merchant-password")}`;

    postJson.mockImplementation(
      async (url: string, _body: unknown, headers?: Record<string, string>) => {
        expect(
          (headers as Record<string, string> | undefined)?.Authorization,
        ).toBe(expectedAuth);

        if (url.endsWith("/v2/transaction/payment")) {
          return JSON.stringify({ is_succeed: true, xact_id: "PAYNET-TXN" });
        }

        if (url.endsWith("/v2/transaction/tds_charge")) {
          return JSON.stringify({
            is_succeed: true,
            xact_id: "PAYNET-3D-TXN",
            reference_no: "ORDER-1",
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    );

    const gateway = BankService.createGateway(BankCodes.PAYNET);
    const auth = sampleAuth(BankCodes.PAYNET, {
      merchant_user: "merchant-user",
      merchant_password: "merchant-password",
      merchant_storekey: "",
    });

    const saleResponse = await gateway.sale(
      makeInstallmentSaleRequest(1),
      auth,
    );
    const threeDResponse = await gateway.sale3DResponse(
      {
        responseArray: {
          session_id: "SESSION",
          token_id: "TOKEN",
        },
      },
      auth,
    );

    expect(saleResponse.status).toBe(SaleResponseStatus.Success);
    expect(saleResponse.transaction_id).toBe("PAYNET-TXN");
    expect(threeDResponse.status).toBe(SaleResponseStatus.Success);
    expect(threeDResponse.private_response).toHaveProperty("response_1");
    expect(threeDResponse.private_response).toHaveProperty("response_2");
  });

  test("Paynet bin ve tüm taksit sorgusunu temsilci BIN setiyle üretir", async () => {
    const postJson = vi.spyOn(HttpClient, "postJson");

    postJson.mockResolvedValue(
      JSON.stringify({
        code: 0,
        data: [
          {
            ratio: [
              { instalment: 2, total_amount: 102.5 },
              { instalment: 3, total_amount: 105.0 },
            ],
          },
        ],
      }),
    );

    const gateway = BankService.createGateway(BankCodes.PAYNET);
    const auth = sampleAuth(BankCodes.PAYNET, { merchant_storekey: "" });

    const binResponse = await gateway.binInstallmentQuery(
      {
        BIN: "413252",
        amount: 100,
      },
      auth,
    );
    const allResponse = await gateway.allInstallmentQuery(
      {
        amount: 100,
      },
      auth,
    );

    expect(binResponse.confirm).toBe(true);
    expect(binResponse.installment_list).toHaveLength(2);
    expect(allResponse.confirm).toBe(true);
    expect(allResponse.installments.length).toBeGreaterThan(0);
  });
});
