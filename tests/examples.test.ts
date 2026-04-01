import { describe, expect, test } from "vitest";

import { SanalPosClient } from "../src/client/sanalpos-client";
import {
  ResponseStatus,
  SaleQueryResponseStatus,
  SaleResponseStatus,
} from "../src/domain/enums";
import { sampleAuth, sampleSaleRequest } from "./fixtures";

describe("örnek akışlar", () => {
  test("satış -> iptal akışı", async () => {
    const sale = await SanalPosClient.sale(sampleSaleRequest(), sampleAuth());
    const cancel = await SanalPosClient.cancel(
      {
        order_number: sale.order_number,
        transaction_id: sale.transaction_id,
      },
      sampleAuth(),
    );

    expect(sale.status).toBe(SaleResponseStatus.Success);
    expect(cancel.status).toBe(ResponseStatus.Success);
  });

  test("satış -> kısmi iade akışı", async () => {
    const sale = await SanalPosClient.sale(sampleSaleRequest(), sampleAuth());
    const refund = await SanalPosClient.refund(
      {
        order_number: sale.order_number,
        transaction_id: sale.transaction_id,
        refund_amount: 5,
      },
      sampleAuth(),
    );

    expect(refund.status).toBe(ResponseStatus.Success);
    expect(refund.refund_amount).toBe(5);
  });

  test("tüm taksit ve ek taksit sorguları döner", async () => {
    const allInstallments = await SanalPosClient.allInstallmentQuery(
      {
        amount: 1000,
      },
      sampleAuth(),
    );
    const additional = await SanalPosClient.additionalInstallmentQuery(
      {
        sale_info: sampleSaleRequest().sale_info,
      },
      sampleAuth(),
    );

    expect(allInstallments.confirm).toBe(true);
    expect(
      allInstallments.installments[0]?.installment_list.length,
    ).toBeGreaterThan(0);
    expect(additional.confirm).toBe(true);
    expect(additional.campaigns.length).toBeGreaterThan(0);
  });

  test("satış sorgu akışı bulunmuş kayıt döner", async () => {
    const response = await SanalPosClient.saleQuery(
      {
        order_number: "ORDER-QUERY-001",
      },
      sampleAuth(),
    );

    expect(response.status).toBe(SaleQueryResponseStatus.Found);
    expect(response.transaction_id).toBeDefined();
  });
});
