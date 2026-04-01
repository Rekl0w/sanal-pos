import type {
  GatewayFamily,
  ResponseStatusValue,
  SaleQueryResponseStatusValue,
  SaleResponseStatusValue,
  ThreeDResponseTypeValue,
} from "./enums";

export interface MerchantAuth {
  bank_code: string;
  merchant_id?: string;
  merchant_user?: string;
  merchant_password?: string;
  merchant_storekey?: string;
  test_platform?: boolean;
}

export interface CustomerInfo {
  tax_number?: string;
  email_address?: string;
  name?: string;
  surname?: string;
  phone_number?: string;
  address_description?: string;
  city_name?: string;
  country?: string;
  post_code?: string;
  tax_office?: string;
  town_name?: string;
}

export interface SaleInfo {
  card_name_surname?: string;
  card_number?: string;
  card_expiry_month?: number;
  card_expiry_year?: number;
  card_cvv?: string;
  amount?: number;
  currency?: number;
  installment?: number;
}

export interface Payment3DConfig {
  confirm?: boolean;
  return_url?: string;
  is_desktop?: boolean;
}

export interface SaleRequest {
  order_number?: string;
  customer_ip_address?: string;
  sale_info?: SaleInfo;
  payment_3d?: Payment3DConfig;
  invoice_info?: CustomerInfo;
  shipping_info?: CustomerInfo;
}

export interface Sale3DResponseRequest {
  responseArray: Record<string, unknown>;
  currency?: number;
  amount?: number;
}

export interface CancelRequest {
  customer_ip_address?: string;
  order_number?: string;
  transaction_id?: string;
  currency?: number;
}

export interface RefundRequest {
  customer_ip_address?: string;
  order_number?: string;
  transaction_id?: string;
  refund_amount?: number;
  currency?: number;
}

export interface BINInstallmentQueryRequest {
  BIN?: string;
  amount?: number;
  currency?: number;
}

export interface SaleQueryRequest {
  order_number?: string;
}

export interface AllInstallmentQueryRequest {
  amount?: number;
  currency?: number;
}

export interface AdditionalInstallmentQueryRequest {
  sale_info?: SaleInfo;
}

export interface InstallmentOption {
  installment: number;
  rate: number;
  total_amount: number;
}

export interface AdditionalInstallmentCampaign {
  code: string;
  title: string;
  extra_installment: number;
  total_installment: number;
}

export interface BankDefinition {
  bank_code: string;
  bank_name: string;
  gateway_family: GatewayFamily;
  collective_vpos: boolean;
  installment_api: boolean;
  commission_auto_add: boolean;
  supports_sale: boolean;
  supports_sale_3d: boolean;
  supports_cancel: boolean;
  supports_refund: boolean;
  requires_storekey: boolean;
  documented: boolean;
  three_d_response_type: ThreeDResponseTypeValue;
}

export interface BankSummary {
  bank_code: string;
  bank_name: string;
  collective_vpos: boolean;
  installment_api: boolean;
  commission_auto_add: boolean;
  gateway_family: GatewayFamily;
  supports_sale: boolean;
  supports_sale_3d: boolean;
  supports_cancel: boolean;
  supports_refund: boolean;
}

export interface BaseOperationResponse {
  message?: string;
  private_response?: Record<string, unknown> | null;
}

export interface SaleResponse extends BaseOperationResponse {
  status: SaleResponseStatusValue;
  order_number?: string;
  transaction_id?: string;
}

export interface CancelResponse extends BaseOperationResponse {
  status: ResponseStatusValue;
  order_number?: string;
  transaction_id?: string;
}

export interface RefundResponse extends BaseOperationResponse {
  status: ResponseStatusValue;
  order_number?: string;
  transaction_id?: string;
  refund_amount?: number;
}

export interface BINInstallmentQueryResponse {
  confirm: boolean;
  bank_code?: string;
  bank_name?: string;
  card_brand?: string;
  card_type?: string;
  commercial_card?: boolean;
  installment_list: InstallmentOption[];
  banks_with_installments?: string[];
  private_response?: Record<string, unknown> | null;
}

export interface AllInstallmentResult {
  bank_code: string;
  bank_name: string;
  installment_list: InstallmentOption[];
}

export interface AllInstallmentQueryResponse {
  confirm: boolean;
  installments: AllInstallmentResult[];
  private_response?: Record<string, unknown> | null;
}

export interface AdditionalInstallmentQueryResponse {
  confirm: boolean;
  campaigns: AdditionalInstallmentCampaign[];
  private_response?: Record<string, unknown> | null;
}

export interface SaleQueryResponse {
  status: SaleQueryResponseStatusValue;
  message?: string;
  order_number?: string;
  transaction_id?: string;
  transaction_date?: string;
  amount?: number;
}

export interface BinRecord {
  bin_number: string;
  bank_code: string;
  card_brand: string;
  card_type: string;
  commercial_card: boolean;
  banks_with_installments: string[];
}
