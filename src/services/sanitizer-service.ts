import type { CustomerInfo, SaleInfo } from "../domain/types";

const trimTo = (
  value: string | undefined,
  length: number,
): string | undefined => {
  if (!value) {
    return undefined;
  }

  return value.trim().slice(0, length);
};

export const clearString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const sanitizeCustomerInfo = (
  info: CustomerInfo | undefined,
): CustomerInfo | undefined => {
  if (!info) {
    return undefined;
  }

  return {
    ...info,
    name: trimTo(clearString(info.name), 50),
    surname: trimTo(clearString(info.surname), 50),
    email_address: trimTo(info.email_address, 100),
    phone_number: trimTo(info.phone_number, 20),
    city_name: trimTo(clearString(info.city_name), 25),
    town_name: trimTo(clearString(info.town_name), 25),
    address_description: trimTo(clearString(info.address_description), 200),
    tax_number: trimTo(info.tax_number, 20),
    tax_office: trimTo(clearString(info.tax_office), 50),
    post_code: trimTo(info.post_code, 10),
  };
};

export const sanitizeSaleInfo = (
  info: SaleInfo | undefined,
): SaleInfo | undefined => {
  if (!info) {
    return undefined;
  }

  return {
    ...info,
    card_name_surname: trimTo(clearString(info.card_name_surname), 50),
    card_number: info.card_number?.replace(/\s+/g, ""),
    card_cvv: info.card_cvv?.trim(),
  };
};
