import { describe, expect, test } from "vitest";

import { SanalPosClient } from "../src/client/sanalpos-client";
import { BankCodes } from "../src/domain/banks";
import { SaleResponseStatus } from "../src/domain/enums";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

describe("catalog coverage", () => {
  test("yeni eklenen banka kayıtları satış akışında kullanılabilir", async () => {
    const response = await SanalPosClient.sale(
      sampleSaleRequest(),
      sampleAuth(BankCodes.ALBARAKA_TURK),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
  });

  test("yeni eklenen provider kayıtları satış akışında kullanılabilir", async () => {
    const response = await SanalPosClient.sale(
      sampleSaleRequest(),
      sampleAuth(BankCodes.HEPSIPAY),
    );

    expect(response.status).toBe(SaleResponseStatus.Success);
  });

  test("allBankList tam katalogu döndürür", () => {
    const banks = SanalPosClient.allBankList();

    expect(banks.length).toBe(48);
  });
});
