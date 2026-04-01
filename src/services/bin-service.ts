import { bankMap, BankCodes } from "../domain/banks";
import type {
  BINInstallmentQueryRequest,
  BINInstallmentQueryResponse,
  BinRecord,
  InstallmentOption,
} from "../domain/types";

const baseBins: BinRecord[] = [
  {
    bin_number: "402278",
    bank_code: BankCodes.QNBPAY,
    card_brand: "Visa",
    card_type: "credit",
    commercial_card: false,
    banks_with_installments: [
      BankCodes.QNBPAY,
      BankCodes.GARANTI_BBVA,
      BankCodes.IS_BANKASI,
      BankCodes.YAPI_KREDI,
    ],
  },
  {
    bin_number: "411111",
    bank_code: BankCodes.GARANTI_BBVA,
    card_brand: "Visa",
    card_type: "credit",
    commercial_card: false,
    banks_with_installments: [
      BankCodes.GARANTI_BBVA,
      BankCodes.AKBANK,
      BankCodes.IS_BANKASI,
      BankCodes.YAPI_KREDI,
    ],
  },
  {
    bin_number: "450803",
    bank_code: BankCodes.IS_BANKASI,
    card_brand: "Visa",
    card_type: "credit",
    commercial_card: false,
    banks_with_installments: [
      BankCodes.IS_BANKASI,
      BankCodes.GARANTI_BBVA,
      BankCodes.ZIRAAT_BANKASI,
    ],
  },
  {
    bin_number: "528939",
    bank_code: BankCodes.GARANTI_BBVA,
    card_brand: "Mastercard",
    card_type: "credit",
    commercial_card: false,
    banks_with_installments: [
      BankCodes.GARANTI_BBVA,
      BankCodes.AKBANK,
      BankCodes.QNBPAY,
    ],
  },
  {
    bin_number: "375624",
    bank_code: BankCodes.GARANTI_BBVA,
    card_brand: "Amex",
    card_type: "credit",
    commercial_card: false,
    banks_with_installments: [
      BankCodes.GARANTI_BBVA,
      BankCodes.TURK_EKONOMI_BANKASI,
      BankCodes.DENIZBANK,
    ],
  },
];

const roundAmount = (value: number): number => Number(value.toFixed(2));

const resolveRate = (installment: number, isCollective: boolean): number => {
  const table: Record<number, number> = {
    1: 0,
    2: 1.5,
    3: 2.8,
    6: 5.4,
    9: 8.1,
    12: 10.8,
  };

  const rate = table[installment] ?? Math.min(installment * 1.1, 15);
  return roundAmount(isCollective ? rate + 0.2 : rate);
};

export class BinService {
  static find(binNumber: string): BinRecord | undefined {
    return baseBins.find((record) => binNumber.startsWith(record.bin_number));
  }

  static resolveInstallments(
    amount: number,
    bankCodes: string[],
  ): InstallmentOption[] {
    const uniqueBankCode =
      bankCodes.find((code) => bankMap.has(code)) ?? BankCodes.QNBPAY;
    const bank = bankMap.get(uniqueBankCode);
    const isCollective = bank?.collective_vpos ?? true;

    return [1, 2, 3, 6, 9, 12].map((installment) => {
      const rate = resolveRate(installment, isCollective);
      const total_amount =
        installment === 1
          ? roundAmount(amount)
          : roundAmount(amount * (1 + rate / 100));

      return {
        installment,
        rate,
        total_amount,
      };
    });
  }

  static query(
    request: BINInstallmentQueryRequest,
  ): BINInstallmentQueryResponse {
    const normalizedBin = (request.BIN ?? "").slice(0, 8);
    const record = this.find(normalizedBin);
    const amount = request.amount ?? 100;

    if (!record) {
      return {
        confirm: false,
        installment_list: [],
        private_response: {
          requested_bin: normalizedBin,
        },
      };
    }

    const bank = bankMap.get(record.bank_code);

    return {
      confirm: true,
      bank_code: record.bank_code,
      bank_name: bank?.bank_name ?? record.bank_code,
      card_brand: record.card_brand,
      card_type: record.card_type,
      commercial_card: record.commercial_card,
      banks_with_installments: record.banks_with_installments,
      installment_list: this.resolveInstallments(
        amount,
        record.banks_with_installments,
      ),
      private_response: {
        normalized_bin: normalizedBin,
      },
    };
  }
}
