import "dotenv/config";

import { describe, expect, test } from "vitest";

import { SanalPosClient } from "../src/client/sanalpos-client";
import type { MerchantAuth } from "../src/domain/types";
import { sampleSaleRequest } from "./fixtures";

const liveEnabled = process.env.RUN_LIVE_TESTS === "true";

const livePrefixes = [
  "AKBANK",
  "AKBANK_NESTPAY",
  "ALTERNATIF_BANK",
  "ANADOLUBANK",
  "DENIZBANK",
  "QNB_FINANSBANK",
  "FINANSBANK_NESTPAY",
  "GARANTI",
  "HALKBANK",
  "ING_BANK",
  "IS_BANKASI",
  "TURK_EKONOMI_BANKASI",
  "TURKIYE_FINANS",
  "VAKIFBANK",
  "YAPI_KREDI",
  "SEKERBANK",
  "ZIRAAT_BANKASI",
  "KUVEYT_TURK",
  "VAKIF_KATILIM",
  "PAYNKOLAY",
  "HALKODE",
  "TAMI",
  "VAKIFPAYS",
  "ZIRAATPAY",
  "VEPARA",
  "MOKA",
  "AHLPAY",
  "IQMONEY",
  "PAROLAPARA",
  "PAYBULL",
  "PARAMPOS",
  "QNBPAY",
  "SIPAY",
  "PAYTEN",
  "IYZICO",
  "CARDPLUS",
  "PARATIKA",
] as const;

const envAuth = (prefix: string): MerchantAuth => ({
  bank_code: process.env[`${prefix}_BANK_CODE`] ?? "",
  merchant_id: process.env[`${prefix}_MERCHANT_ID`] ?? "",
  merchant_user: process.env[`${prefix}_MERCHANT_USER`] ?? "",
  merchant_password: process.env[`${prefix}_MERCHANT_PASSWORD`] ?? "",
  merchant_storekey: process.env[`${prefix}_MERCHANT_STOREKEY`] ?? "",
  test_platform: (process.env[`${prefix}_TEST_PLATFORM`] ?? "true") === "true",
});

const hasAuth = (auth: MerchantAuth): boolean =>
  Boolean(
    auth.bank_code &&
    auth.merchant_id &&
    auth.merchant_user &&
    auth.merchant_password,
  );

const describeIf = liveEnabled ? describe : describe.skip;

describeIf("live integration smoke", () => {
  for (const prefix of livePrefixes) {
    test(`${prefix} auth can initialize a real sale request`, async () => {
      const auth = envAuth(prefix);
      if (!hasAuth(auth)) {
        return;
      }

      const response = await SanalPosClient.sale(
        sampleSaleRequest({ order_number: `${prefix}-LIVE-${Date.now()}` }),
        auth,
      );

      expect(["success", "redirect_url", "redirect_html", "error"]).toContain(
        response.status,
      );
      expect(response.message).toBeDefined();
    });
  }
});
