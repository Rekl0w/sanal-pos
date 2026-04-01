import { BankCodes } from "../src/domain/banks";
import { CountryMap, CurrencyMap } from "../src/domain/enums";
import type {
  CustomerInfo,
  MerchantAuth,
  SaleRequest,
} from "../src/domain/types";

export const sampleAuth = (
  bankCode: string = BankCodes.HEPSIPAY,
  overrides: Partial<MerchantAuth> = {},
): MerchantAuth => ({
  bank_code: bankCode,
  merchant_id: "20158",
  merchant_user: "07fb70f9d8de575f32baa6518e38c5d6",
  merchant_password: "61d97b2cac247069495be4b16f8604db",
  merchant_storekey: "$2y$10$N9IJkgazXMUwCzpn7NJrZePy3v.dIFOQUyW4yGfT3eWry6m.KxanK",
  test_platform: true,
  ...overrides,
});

export const sampleCustomer = (
  overrides: Partial<CustomerInfo> = {},
): CustomerInfo => ({
  tax_number: "1111111111",
  email_address: "test@test.com",
  name: "cem",
  surname: "pehlivan",
  phone_number: "1111111111",
  address_description: "adres",
  city_name: "istanbul",
  country: CountryMap.TUR,
  post_code: "34000",
  tax_office: "maltepe",
  town_name: "maltepe",
  ...overrides,
});

export const sampleSaleRequest = (
  overrides: Partial<SaleRequest> = {},
): SaleRequest => ({
  order_number: "ORDER-001",
  customer_ip_address: "1.1.1.1",
  sale_info: {
    card_name_surname: "test kart",
    card_number: "4022780520669303",
    card_expiry_month: 1,
    card_expiry_year: 2050,
    card_cvv: "988",
    amount: 10,
    currency: CurrencyMap.TRY,
    installment: 1,
  },
  payment_3d: {
    confirm: false,
  },
  invoice_info: sampleCustomer(),
  shipping_info: sampleCustomer(),
  ...overrides,
});
