import { describe, expect, test } from "vitest";

import { BankCodes } from "../src/domain/banks";
import { sanitizeCustomerInfo } from "../src/services/sanitizer-service";
import {
  validateMerchantAuth,
  validateSale3DResponseRequest,
  validateSaleInfo,
} from "../src/services/validation-service";
import { sampleAuth, sampleCustomer } from "./fixtures";

describe("validation", () => {
  test("geçersiz saleInfo birden fazla hata döndürür", () => {
    const issues = validateSaleInfo({
      card_name_surname: "",
      card_number: "123",
      card_expiry_month: 13,
      card_expiry_year: 2018,
      card_cvv: "1",
      amount: -10,
      installment: 20,
    });

    expect(issues).toContain("Kart üzerindeki isim boş olamaz.");
    expect(issues).toContain("Kart numarası 15-19 karakter arasında olmalıdır.");
    expect(issues).toContain("Son kullanma ayı 1-12 arasında olmalıdır.");
    expect(issues).toContain("Son kullanma yılı geçersiz.");
    expect(issues).toContain("CVV 3-4 karakter olmalıdır.");
    expect(issues).toContain("Tutar sıfırdan büyük olmalıdır.");
    expect(issues).toContain("Taksit sayısı 1-15 arasında olmalıdır.");
  });

  test("müşteri bilgisi sanitize edilir", () => {
    const sanitized = sanitizeCustomerInfo(
      sampleCustomer({
        name: "A".repeat(100),
        surname: "B".repeat(100),
        city_name: "C".repeat(100),
        address_description: "D".repeat(300),
      }),
    );

    expect(sanitized?.name?.length).toBeLessThanOrEqual(50);
    expect(sanitized?.surname?.length).toBeLessThanOrEqual(50);
    expect(sanitized?.city_name?.length).toBeLessThanOrEqual(25);
    expect(sanitized?.address_description?.length).toBeLessThanOrEqual(200);
  });

  test("storekey gereken bankada merchant_storekey zorunludur", () => {
    const issues = validateMerchantAuth(
      sampleAuth(BankCodes.QNBPAY, {
        merchant_storekey: "",
      }),
    );

    expect(issues).toContain("merchant_storekey alanı zorunludur");
  });

  test("Yapı Kredi 3D response için currency ister", () => {
    const issues = validateSale3DResponseRequest(
      {
        responseArray: {
          mdStatus: "1",
        },
      },
      sampleAuth(BankCodes.YAPI_KREDI),
    );

    expect(issues).toContain("currency alanı Yapı Kredi bankası için zorunludur");
  });
});
