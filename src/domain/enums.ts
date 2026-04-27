export const CurrencyMap = {
  TRY: 949,
  USD: 840,
  EUR: 978,
  GBP: 826,
} as const;

export type CurrencyKey = keyof typeof CurrencyMap;
export type CurrencyCode = (typeof CurrencyMap)[CurrencyKey];

export const CountryMap = {
  TUR: "TUR",
  USA: "USA",
  GBR: "GBR",
  DEU: "DEU",
} as const;

export type CountryCode = (typeof CountryMap)[keyof typeof CountryMap];

export const SaleResponseStatus = {
  Success: "success",
  Error: "error",
  RedirectURL: "redirect_url",
  RedirectHTML: "redirect_html",
} as const;

export type SaleResponseStatusValue =
  (typeof SaleResponseStatus)[keyof typeof SaleResponseStatus];

export const ResponseStatus = {
  Success: "success",
  Error: "error",
} as const;

export type ResponseStatusValue =
  (typeof ResponseStatus)[keyof typeof ResponseStatus];

export const InstallmentCommissionPolicy = {
  Default: "default",
  ChargeToCustomer: "charge_to_customer",
  AbsorbByMerchant: "absorb_by_merchant",
} as const;

export type InstallmentCommissionPolicyValue =
  (typeof InstallmentCommissionPolicy)[keyof typeof InstallmentCommissionPolicy];

export const SaleQueryResponseStatus = {
  Found: "found",
  NotFound: "not_found",
  Error: "error",
} as const;

export type SaleQueryResponseStatusValue =
  (typeof SaleQueryResponseStatus)[keyof typeof SaleQueryResponseStatus];

export const ThreeDResponseType = {
  RedirectURL: "redirect_url",
  RedirectHTML: "redirect_html",
} as const;

export type ThreeDResponseTypeValue =
  (typeof ThreeDResponseType)[keyof typeof ThreeDResponseType];

export const GatewayFamilies = [
  "akbank",
  "nestpay",
  "garanti",
  "vakifbank",
  "yapi_kredi",
  "katilim",
  "payten",
  "ccpayment",
  "paynet",
  "parampos",
  "moka",
  "ahlpay",
  "iyzico",
  "tami",
  "paynkolay",
  "qnb_finansbank",
  "generic",
] as const;

export type GatewayFamily = (typeof GatewayFamilies)[number];

export const currencyNameFromCode = (currency: CurrencyCode): CurrencyKey => {
  const match = Object.entries(CurrencyMap).find(
    ([, value]) => value === currency,
  );

  if (!match) {
    return "TRY";
  }

  return match[0] as CurrencyKey;
};
