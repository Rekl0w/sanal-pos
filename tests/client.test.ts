import { describe, expect, test } from "vitest";

import { SanalPosClient } from "../src/client/sanalpos-client";
import { BankCodes } from "../src/domain/banks";
import { ResponseStatus, SaleResponseStatus } from "../src/domain/enums";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

describe("SanalPosClient", () => {
  test("3D'siz satış başarılı döner", async () => {
    const response = await SanalPosClient.sale(sampleSaleRequest(), sampleAuth());

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBeDefined();
  });

  test("3D satış redirect_url döner", async () => {
    const response = await SanalPosClient.sale(
      sampleSaleRequest({
        payment_3d: {
          confirm: true,
          return_url: "https://example.com/payment/3d-response",
        },
      }),
      sampleAuth(BankCodes.HEPSIPAY),
    );

    expect(response.status).toBe(SaleResponseStatus.RedirectURL);
    expect(response.message).toContain("https://example.com/payment/3d-response");
  });

  test("3D callback başarıya çevrilir", async () => {
    const response = await SanalPosClient.sale3DResponse(
      {
        responseArray: {
          mdStatus: "1",
          procReturnCode: "00",
          orderId: "ORDER-3D-001",
          transId: "TXN-3D-001",
        },
      },
      sampleAuth(),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
    expect(response.transaction_id).toBe("TXN-3D-001");
  });

  test("desteklenmeyen iptal uygun hata mesajı döner", async () => {
    const response = await SanalPosClient.cancel(
      {
        order_number: "ORDER-001",
        transaction_id: "TXN-001",
      },
      sampleAuth(BankCodes.GARANTI_BBVA),
    );

    expect(response.status).toBe(ResponseStatus.Error);
  });

  test("iade başarılı döner", async () => {
    const response = await SanalPosClient.refund(
      {
        order_number: "ORDER-001",
        transaction_id: "TXN-001",
        refund_amount: 50,
      },
      sampleAuth(BankCodes.HEPSIPAY),
    );

    expect(response.status).toBe(ResponseStatus.Success);
    expect(response.refund_amount).toBe(50);
  });

  test("bin sorgusu taksit listesi döner", async () => {
    const response = await SanalPosClient.binInstallmentQuery(
      {
        BIN: "402278",
        amount: 1000,
      },
      sampleAuth(),
    );

    expect(response.confirm).toBe(true);
    expect(response.installment_list.length).toBeGreaterThan(0);
  });

  test("banka listesi filtrelenebilir", () => {
    const banks = SanalPosClient.allBankList((bank) => bank.collective_vpos);

    expect(banks.length).toBeGreaterThan(5);
    expect(banks.every((bank) => bank.collective_vpos)).toBe(true);
  });
});
