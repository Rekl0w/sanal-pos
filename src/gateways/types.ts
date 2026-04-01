import type {
  AdditionalInstallmentQueryRequest,
  AdditionalInstallmentQueryResponse,
  AllInstallmentQueryRequest,
  AllInstallmentQueryResponse,
  BINInstallmentQueryRequest,
  BINInstallmentQueryResponse,
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

export interface VirtualPosGateway {
  sale(request: SaleRequest, auth: MerchantAuth): Promise<SaleResponse>;
  sale3DResponse(request: Sale3DResponseRequest, auth: MerchantAuth): Promise<SaleResponse>;
  binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse>;
  allInstallmentQuery(
    request: AllInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse>;
  additionalInstallmentQuery(
    request: AdditionalInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<AdditionalInstallmentQueryResponse>;
  cancel(request: CancelRequest, auth: MerchantAuth): Promise<CancelResponse>;
  refund(request: RefundRequest, auth: MerchantAuth): Promise<RefundResponse>;
  saleQuery(request: SaleQueryRequest, auth: MerchantAuth): Promise<SaleQueryResponse>;
}
