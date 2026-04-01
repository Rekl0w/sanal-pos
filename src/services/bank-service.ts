import { bankMap, bankRegistry, BankCodes } from "../domain/banks";
import type { BankDefinition, BankSummary } from "../domain/types";
import { UnsupportedGatewayError } from "../errors";
import { createRealBankGateway } from "../gateways/bank-gateways";
import { createRealProviderGateway } from "../gateways/provider-gateways";
import { SandboxGateway } from "../gateways/sandbox-gateway";
import type { VirtualPosGateway } from "../gateways/types";

export class BankService {
  static readonly AKBANK = BankCodes.AKBANK;
  static readonly AKBANK_NESTPAY = BankCodes.AKBANK_NESTPAY;
  static readonly ALBARAKA_TURK = BankCodes.ALBARAKA_TURK;
  static readonly ALTERNATIF_BANK = BankCodes.ALTERNATIF_BANK;
  static readonly ANADOLUBANK = BankCodes.ANADOLUBANK;
  static readonly DENIZBANK = BankCodes.DENIZBANK;
  static readonly FIBABANKA = BankCodes.FIBABANKA;
  static readonly QNB_FINANSBANK = BankCodes.QNB_FINANSBANK;
  static readonly FINANSBANK_NESTPAY = BankCodes.FINANSBANK_NESTPAY;
  static readonly GARANTI_BBVA = BankCodes.GARANTI_BBVA;
  static readonly HALKBANK = BankCodes.HALKBANK;
  static readonly HSBC = BankCodes.HSBC;
  static readonly ING_BANK = BankCodes.ING_BANK;
  static readonly IS_BANKASI = BankCodes.IS_BANKASI;
  static readonly ODEABANK = BankCodes.ODEABANK;
  static readonly SEKERBANK = BankCodes.SEKERBANK;
  static readonly TURK_EKONOMI_BANKASI = BankCodes.TURK_EKONOMI_BANKASI;
  static readonly TURKIYE_FINANS = BankCodes.TURKIYE_FINANS;
  static readonly VAKIFBANK = BankCodes.VAKIFBANK;
  static readonly YAPI_KREDI = BankCodes.YAPI_KREDI;
  static readonly ZIRAAT_BANKASI = BankCodes.ZIRAAT_BANKASI;
  static readonly AKTIF_YATIRIM = BankCodes.AKTIF_YATIRIM;
  static readonly KUVEYT_TURK = BankCodes.KUVEYT_TURK;
  static readonly VAKIF_KATILIM = BankCodes.VAKIF_KATILIM;
  static readonly ZIRAAT_KATILIM = BankCodes.ZIRAAT_KATILIM;
  static readonly HEPSIPAY = BankCodes.HEPSIPAY;
  static readonly CARDPLUS = BankCodes.CARDPLUS;
  static readonly PARATIKA = BankCodes.PARATIKA;
  static readonly PAYTEN = BankCodes.PAYTEN;
  static readonly PAYTR = BankCodes.PAYTR;
  static readonly IPARA = BankCodes.IPARA;
  static readonly PAYU = BankCodes.PAYU;
  static readonly ZIRAATPAY = BankCodes.ZIRAATPAY;
  static readonly VAKIFPAYS = BankCodes.VAKIFPAYS;
  static readonly IYZICO = BankCodes.IYZICO;
  static readonly SIPAY = BankCodes.SIPAY;
  static readonly QNBPAY = BankCodes.QNBPAY;
  static readonly PARAMPOS = BankCodes.PARAMPOS;
  static readonly PAYBULL = BankCodes.PAYBULL;
  static readonly PAROLAPARA = BankCodes.PAROLAPARA;
  static readonly IQMONEY = BankCodes.IQMONEY;
  static readonly AHLPAY = BankCodes.AHLPAY;
  static readonly MOKA = BankCodes.MOKA;
  static readonly VEPARA = BankCodes.VEPARA;
  static readonly TAMI = BankCodes.TAMI;
  static readonly HALKODE = BankCodes.HALKODE;
  static readonly PAYNKOLAY = BankCodes.PAYNKOLAY;

  static allBanks(filter?: (bank: BankDefinition) => boolean): BankSummary[] {
    const banks = filter ? bankRegistry.filter(filter) : bankRegistry;

    return banks.map((bank) => ({
      bank_code: bank.bank_code,
      bank_name: bank.bank_name,
      collective_vpos: bank.collective_vpos,
      installment_api: bank.installment_api,
      commission_auto_add: bank.commission_auto_add,
      gateway_family: bank.gateway_family,
      supports_sale: bank.supports_sale,
      supports_sale_3d: bank.supports_sale_3d,
      supports_cancel: bank.supports_cancel,
      supports_refund: bank.supports_refund,
    }));
  }

  static getBank(bankCode: string): BankDefinition | undefined {
    return bankMap.get(bankCode);
  }

  static createGateway(bankCode: string): VirtualPosGateway {
    const bank = this.getBank(bankCode);

    if (!bank) {
      throw new UnsupportedGatewayError(bankCode);
    }

    const realGateway =
      createRealBankGateway(bank) ?? createRealProviderGateway(bank);
    if (realGateway) {
      return realGateway;
    }

    return new SandboxGateway(bank);
  }
}
