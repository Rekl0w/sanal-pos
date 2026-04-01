import {
  AdditionalInstallmentQueryRequestSchema,
  AllInstallmentQueryRequestSchema,
  BINInstallmentQueryRequestSchema,
  CancelRequestSchema,
  MerchantAuthSchema,
  RefundRequestSchema,
  Sale3DResponseRequestSchema,
  SaleQueryRequestSchema,
  SaleRequestSchema,
} from "../domain/schemas";
import type {
  AdditionalInstallmentQueryRequest,
  AdditionalInstallmentQueryResponse,
  AllInstallmentQueryRequest,
  AllInstallmentQueryResponse,
  BINInstallmentQueryRequest,
  BINInstallmentQueryResponse,
  BankSummary,
  CancelRequest,
  CancelResponse,
  MerchantAuth,
  RefundRequest,
  RefundResponse,
  Sale3DResponseRequest,
  SaleQueryRequest,
  SaleQueryResponse,
  SaleRequest,
  SaleResponse,
} from "../domain/types";
import { BankService } from "../services/bank-service";
import { sanitizeCustomerInfo, sanitizeSaleInfo } from "../services/sanitizer-service";
import {
  assertIssues,
  validateBINInstallmentQuery,
  validateCancelRequest,
  validateMerchantAuth,
  validateRefundRequest,
  validateSale3DResponseRequest,
  validateSaleQueryRequest,
  validateSaleRequest,
} from "../services/validation-service";

export class SanalPosClient {
  static async sale(input: SaleRequest, authInput: MerchantAuth): Promise<SaleResponse> {
    const request = SaleRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateSaleRequest(request));
    assertIssues(validateMerchantAuth(auth));

    const sanitizedRequest: SaleRequest = {
      ...request,
      sale_info: sanitizeSaleInfo(request.sale_info),
      invoice_info: sanitizeCustomerInfo(request.invoice_info),
      shipping_info: sanitizeCustomerInfo(request.shipping_info),
    };

    return this.getGateway(auth.bank_code).sale(sanitizedRequest, auth);
  }

  static async sale3DResponse(
    input: Sale3DResponseRequest,
    authInput: MerchantAuth,
  ): Promise<SaleResponse> {
    const request = Sale3DResponseRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateMerchantAuth(auth));

    const normalizedResponseArray = Object.fromEntries(
      Object.entries(request.responseArray).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, value[0]];
        }

        return [key, value];
      }),
    );

    const normalizedRequest: Sale3DResponseRequest = {
      ...request,
      responseArray: normalizedResponseArray,
    };

    assertIssues(validateSale3DResponseRequest(normalizedRequest, auth));

    return this.getGateway(auth.bank_code).sale3DResponse(normalizedRequest, auth);
  }

  static async binInstallmentQuery(
    input: BINInstallmentQueryRequest,
    authInput: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const request = BINInstallmentQueryRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateBINInstallmentQuery(request));
    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).binInstallmentQuery(request, auth);
  }

  static async allInstallmentQuery(
    input: AllInstallmentQueryRequest,
    authInput: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse> {
    const request = AllInstallmentQueryRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).allInstallmentQuery(request, auth);
  }

  static async additionalInstallmentQuery(
    input: AdditionalInstallmentQueryRequest,
    authInput: MerchantAuth,
  ): Promise<AdditionalInstallmentQueryResponse> {
    const request = AdditionalInstallmentQueryRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).additionalInstallmentQuery(request, auth);
  }

  static async cancel(input: CancelRequest, authInput: MerchantAuth): Promise<CancelResponse> {
    const request = CancelRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateCancelRequest(request));
    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).cancel(request, auth);
  }

  static async refund(input: RefundRequest, authInput: MerchantAuth): Promise<RefundResponse> {
    const request = RefundRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateRefundRequest(request));
    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).refund(request, auth);
  }

  static async saleQuery(input: SaleQueryRequest, authInput: MerchantAuth): Promise<SaleQueryResponse> {
    const request = SaleQueryRequestSchema.parse(input);
    const auth = MerchantAuthSchema.parse(authInput);

    assertIssues(validateSaleQueryRequest(request));
    assertIssues(validateMerchantAuth(auth));

    return this.getGateway(auth.bank_code).saleQuery(request, auth);
  }

  static allBankList(filter?: (bank: BankSummary) => boolean): BankSummary[] {
    const banks = BankService.allBanks();
    return filter ? banks.filter(filter) : banks;
  }

  private static getGateway(bankCode: string) {
    return BankService.createGateway(bankCode);
  }
}
