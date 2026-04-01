import { bankMap } from "../domain/banks";
import { CurrencyMap } from "../domain/enums";
import type {
  BINInstallmentQueryRequest,
  CancelRequest,
  CustomerInfo,
  MerchantAuth,
  RefundRequest,
  Sale3DResponseRequest,
  SaleInfo,
  SaleQueryRequest,
  SaleRequest,
} from "../domain/types";
import { ValidationError } from "../errors";

const isNonEmptyString = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const luhnCheck = (cardNumber: string): boolean => {
  let sum = 0;
  let shouldDouble = false;

  for (let index = cardNumber.length - 1; index >= 0; index -= 1) {
    let digit = Number(cardNumber[index]);

    if (!Number.isInteger(digit)) {
      return false;
    }

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
};

const validateCustomerInfo = (label: string, info: CustomerInfo | undefined): string[] => {
  if (!info) {
    return [`${label} alanı zorunludur`];
  }

  const issues: string[] = [];

  if (!isNonEmptyString(info.name)) {
    issues.push(`${label}.name alanı zorunludur`);
  }

  if (!isNonEmptyString(info.surname)) {
    issues.push(`${label}.surname alanı zorunludur`);
  }

  return issues;
};

export const validateSaleInfo = (saleInfo: SaleInfo | undefined): string[] => {
  if (!saleInfo) {
    return ["sale_info alanı zorunludur"];
  }

  const issues: string[] = [];

  if (!isNonEmptyString(saleInfo.card_name_surname)) {
    issues.push("Kart üzerindeki isim boş olamaz.");
  }

  if (!/^\d{15,19}$/.test(saleInfo.card_number ?? "")) {
    issues.push("Kart numarası 15-19 karakter arasında olmalıdır.");
  } else if (!luhnCheck(saleInfo.card_number ?? "")) {
    issues.push("Geçersiz kart numarası");
  }

  if (
    !Number.isInteger(saleInfo.card_expiry_month) ||
    (saleInfo.card_expiry_month ?? 0) < 1 ||
    (saleInfo.card_expiry_month ?? 0) > 12
  ) {
    issues.push("Son kullanma ayı 1-12 arasında olmalıdır.");
  }

  if (
    !Number.isInteger(saleInfo.card_expiry_year) ||
    (saleInfo.card_expiry_year ?? 0) < 2020 ||
    (saleInfo.card_expiry_year ?? 0) > 2100
  ) {
    issues.push("Son kullanma yılı geçersiz.");
  }

  if (!/^\d{3,4}$/.test(saleInfo.card_cvv ?? "")) {
    issues.push("CVV 3-4 karakter olmalıdır.");
  }

  if (!isPositiveNumber(saleInfo.amount)) {
    issues.push("Tutar sıfırdan büyük olmalıdır.");
  }

  if (
    !Number.isInteger(saleInfo.installment) ||
    (saleInfo.installment ?? 0) < 1 ||
    (saleInfo.installment ?? 0) > 15
  ) {
    issues.push("Taksit sayısı 1-15 arasında olmalıdır.");
  }

  const validCurrencies = new Set<number>(Object.values(CurrencyMap));
  if (saleInfo.currency !== undefined && !validCurrencies.has(saleInfo.currency)) {
    issues.push("Geçersiz para birimi");
  }

  return issues;
};

export const validateMerchantAuth = (auth: MerchantAuth): string[] => {
  const issues: string[] = [];

  if (!isNonEmptyString(auth.bank_code)) {
    issues.push("Banka kodu boş olamaz.");
    return issues;
  }

  const bank = bankMap.get(auth.bank_code.trim());

  if (!bank) {
    issues.push(`'${auth.bank_code}' banka kodu için entegrasyon bulunamadı.`);
    return issues;
  }

  if (!isNonEmptyString(auth.merchant_id)) {
    issues.push("merchant_id alanı zorunludur");
  }

  if (!isNonEmptyString(auth.merchant_user)) {
    issues.push("merchant_user alanı zorunludur");
  }

  if (!isNonEmptyString(auth.merchant_password)) {
    issues.push("merchant_password alanı zorunludur");
  }

  if (bank.requires_storekey && !isNonEmptyString(auth.merchant_storekey)) {
    issues.push("merchant_storekey alanı zorunludur");
  }

  return issues;
};

export const validateSaleRequest = (request: SaleRequest): string[] => {
  const issues: string[] = [];

  if (!isNonEmptyString(request.order_number)) {
    issues.push("order_number alanı zorunludur");
  }

  if (!isNonEmptyString(request.customer_ip_address)) {
    issues.push("customer_ip_address alanı zorunludur");
  }

  issues.push(...validateSaleInfo(request.sale_info));
  issues.push(...validateCustomerInfo("invoice_info", request.invoice_info));
  issues.push(...validateCustomerInfo("shipping_info", request.shipping_info));

  if (request.payment_3d?.confirm && !isNonEmptyString(request.payment_3d.return_url)) {
    issues.push("payment_3d.return_url alanı 3D işlemler için zorunludur");
  }

  return issues;
};

export const validateCancelRequest = (request: CancelRequest): string[] => {
  const issues: string[] = [];

  if (!isNonEmptyString(request.order_number) && !isNonEmptyString(request.transaction_id)) {
    issues.push("order_number veya transaction_id alanlarından en az biri zorunludur");
  }

  return issues;
};

export const validateRefundRequest = (request: RefundRequest): string[] => {
  const issues = validateCancelRequest(request);

  if (!isPositiveNumber(request.refund_amount)) {
    issues.push("refund_amount sıfırdan büyük olmalıdır");
  }

  return issues;
};

export const validateBINInstallmentQuery = (
  request: BINInstallmentQueryRequest,
): string[] => {
  const issues: string[] = [];

  if (!/^\d{6,8}$/.test(request.BIN ?? "")) {
    issues.push("BIN 6-8 karakter olmalıdır");
  }

  return issues;
};

export const validateSale3DResponseRequest = (
  request: Sale3DResponseRequest,
  auth: MerchantAuth,
): string[] => {
  const issues: string[] = [];

  if (!request.responseArray || Object.keys(request.responseArray).length === 0) {
    issues.push("responseArray alanı zorunludur");
  }

  if (auth.bank_code === "0067" && request.currency === undefined) {
    issues.push("currency alanı Yapı Kredi bankası için zorunludur");
  }

  return issues;
};

export const validateSaleQueryRequest = (request: SaleQueryRequest): string[] => {
  if (!isNonEmptyString(request.order_number)) {
    return ["order_number alanı zorunludur"];
  }

  return [];
};

export const assertIssues = (issues: string[]): void => {
  if (issues.length > 0) {
    throw new ValidationError(issues[0] ?? "Doğrulama hatası", issues);
  }
};
