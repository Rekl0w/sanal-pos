import { describe, expect, test } from "vitest";

import { bankRegistry, BankCodes } from "../src/domain/banks";
import { BankService } from "../src/services/bank-service";

describe("BankService", () => {
  test("tüm banka listesi boş değildir", () => {
    const banks = BankService.allBanks();

    expect(Array.isArray(banks)).toBe(true);
    expect(banks.length).toBe(48);
  });

  test("banka kodları benzersizdir", () => {
    const codes = bankRegistry.map((bank) => bank.bank_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("Garanti BBVA banka kaydı bulunur", () => {
    const bank = BankService.getBank(BankCodes.GARANTI_BBVA);

    expect(bank).toBeDefined();
    expect(bank?.bank_name).toBe("Garanti BBVA");
    expect(bank?.supports_refund).toBe(false);
  });

  test("gateway tüm dokümante edilmiş bankalar için üretilebilir", () => {
    for (const bank of BankService.allBanks()) {
      const gateway = BankService.createGateway(bank.bank_code);
      expect(gateway).toBeDefined();
    }
  });

  test("eksik kalan referans kayıtları artık katalogda var", () => {
    const expectedCodes = [
      BankCodes.ALBARAKA_TURK,
      BankCodes.FIBABANKA,
      BankCodes.HSBC,
      BankCodes.ODEABANK,
      BankCodes.AKTIF_YATIRIM,
      BankCodes.ZIRAAT_KATILIM,
      BankCodes.HEPSIPAY,
      BankCodes.PAYTR,
      BankCodes.IPARA,
      BankCodes.PAYU,
    ];

    for (const code of expectedCodes) {
      expect(BankService.getBank(code)).toBeDefined();
    }
  });
});
