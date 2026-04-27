import { z } from "zod";

import {
  CountryMap,
  CurrencyMap,
  GatewayFamilies,
  InstallmentCommissionPolicy,
} from "./enums";

const currencyValueSet = new Set<number>(Object.values(CurrencyMap));
const countryValueSet = new Set<string>(Object.values(CountryMap));
const normalizeInstallmentCommissionPolicy = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") {
    return InstallmentCommissionPolicy.Default;
  }

  if (typeof value === "number") {
    switch (value) {
      case 1:
        return InstallmentCommissionPolicy.ChargeToCustomer;
      case 2:
        return InstallmentCommissionPolicy.AbsorbByMerchant;
      case 0:
      default:
        return InstallmentCommissionPolicy.Default;
    }
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    switch (normalized) {
      case "0":
      case "default":
        return InstallmentCommissionPolicy.Default;
      case "1":
      case "chargetocustomer":
      case "charge_to_customer":
      case "customer":
        return InstallmentCommissionPolicy.ChargeToCustomer;
      case "2":
      case "absorbbymerchant":
      case "absorb_by_merchant":
      case "merchant":
        return InstallmentCommissionPolicy.AbsorbByMerchant;
      default:
        return normalized;
    }
  }

  return value;
};

export const InstallmentCommissionPolicySchema = z.preprocess(
  normalizeInstallmentCommissionPolicy,
  z.union([
    z.literal(InstallmentCommissionPolicy.Default),
    z.literal(InstallmentCommissionPolicy.ChargeToCustomer),
    z.literal(InstallmentCommissionPolicy.AbsorbByMerchant),
  ]),
);

export const CurrencySchema = z.preprocess(
  (value: unknown) => {
    if (typeof value === "string") {
      const normalized = value.trim().toUpperCase();

      if (normalized in CurrencyMap) {
        return CurrencyMap[normalized as keyof typeof CurrencyMap];
      }

      const asNumber = Number(normalized);

      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
    }

    return value;
  },
  z
    .number()
    .refine(
      (value: number) => currencyValueSet.has(value),
      "Geçersiz para birimi",
    ),
);

export const CountrySchema = z.preprocess(
  (value: unknown) => {
    if (typeof value === "string") {
      return value.trim().toUpperCase();
    }

    return value;
  },
  z
    .string()
    .refine(
      (value: string) => countryValueSet.has(value),
      "Geçersiz ülke kodu",
    ),
);

export const MerchantAuthSchema = z.object({
  bank_code: z.string().trim().min(1),
  merchant_id: z.string().trim().optional(),
  merchant_user: z.string().trim().optional(),
  merchant_password: z.string().trim().optional(),
  merchant_storekey: z.string().trim().optional(),
  test_platform: z.boolean().optional().default(true),
  installment_commission_policy:
    InstallmentCommissionPolicySchema.optional().default(
      InstallmentCommissionPolicy.Default,
    ),
});

export const CustomerInfoSchema = z.object({
  tax_number: z.string().trim().optional(),
  email_address: z.string().trim().optional(),
  name: z.string().trim().optional(),
  surname: z.string().trim().optional(),
  phone_number: z.string().trim().optional(),
  address_description: z.string().trim().optional(),
  city_name: z.string().trim().optional(),
  country: CountrySchema.optional(),
  post_code: z.string().trim().optional(),
  tax_office: z.string().trim().optional(),
  town_name: z.string().trim().optional(),
});

export const SaleInfoSchema = z.object({
  card_name_surname: z.string().trim().optional(),
  card_number: z.string().trim().optional(),
  card_expiry_month: z.number().int().optional(),
  card_expiry_year: z.number().int().optional(),
  card_cvv: z.string().trim().optional(),
  amount: z.number().optional(),
  currency: CurrencySchema.optional(),
  installment: z.number().int().optional(),
});

export const Payment3DConfigSchema = z.object({
  confirm: z.boolean().optional().default(false),
  return_url: z.string().trim().url().optional(),
  is_desktop: z.boolean().optional(),
});

export const SaleRequestSchema = z.object({
  order_number: z.string().trim().optional(),
  customer_ip_address: z.string().trim().optional(),
  sale_info: SaleInfoSchema.optional(),
  payment_3d: Payment3DConfigSchema.optional(),
  invoice_info: CustomerInfoSchema.optional(),
  shipping_info: CustomerInfoSchema.optional(),
});

export const Sale3DResponseRequestSchema = z.object({
  responseArray: z.record(z.string(), z.unknown()),
  currency: CurrencySchema.optional(),
  amount: z.number().optional(),
});

export const CancelRequestSchema = z.object({
  customer_ip_address: z.string().trim().optional(),
  order_number: z.string().trim().optional(),
  transaction_id: z.string().trim().optional(),
  currency: CurrencySchema.optional(),
});

export const RefundRequestSchema = z.object({
  customer_ip_address: z.string().trim().optional(),
  order_number: z.string().trim().optional(),
  transaction_id: z.string().trim().optional(),
  refund_amount: z.number().optional(),
  currency: CurrencySchema.optional(),
});

export const BINInstallmentQueryRequestSchema = z.object({
  BIN: z.string().trim().optional(),
  amount: z.number().optional(),
  currency: CurrencySchema.optional(),
});

export const SaleQueryRequestSchema = z.object({
  order_number: z.string().trim().optional(),
});

export const AllInstallmentQueryRequestSchema = z.object({
  amount: z.number().optional(),
  currency: CurrencySchema.optional(),
});

export const AdditionalInstallmentQueryRequestSchema = z.object({
  sale_info: SaleInfoSchema.optional(),
});

export const GatewayFamilySchema = z.enum(GatewayFamilies);

export const SaleRequestEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: SaleRequestSchema,
});

export const Sale3DEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: Sale3DResponseRequestSchema,
});

export const CancelEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: CancelRequestSchema,
});

export const RefundEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: RefundRequestSchema,
});

export const BinEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: BINInstallmentQueryRequestSchema,
});

export const SaleQueryEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: SaleQueryRequestSchema,
});

export const AllInstallmentEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: AllInstallmentQueryRequestSchema,
});

export const AdditionalInstallmentEnvelopeSchema = z.object({
  auth: MerchantAuthSchema,
  request: AdditionalInstallmentQueryRequestSchema,
});
