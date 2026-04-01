import { ResponseStatus, SaleQueryResponseStatus, SaleResponseStatus } from "../domain/enums";
import type {
  AdditionalInstallmentQueryRequest,
  AdditionalInstallmentQueryResponse,
  AllInstallmentQueryRequest,
  AllInstallmentQueryResponse,
  BINInstallmentQueryRequest,
  BINInstallmentQueryResponse,
  BankDefinition,
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
import type { VirtualPosGateway } from "./types";

export abstract class AbstractGateway implements VirtualPosGateway {
  protected readonly bank: BankDefinition;

  constructor(bank: BankDefinition) {
    this.bank = bank;
  }

  async sale(_request: SaleRequest, _auth: MerchantAuth): Promise<SaleResponse> {
    return {
      status: SaleResponseStatus.Error,
      message: "Bu banka için satış metodu henüz tanımlanmamış!",
    };
  }

  async sale3DResponse(_request: Sale3DResponseRequest, _auth: MerchantAuth): Promise<SaleResponse> {
    return {
      status: SaleResponseStatus.Error,
      message: "Bu banka için 3D satış sonucu metodu henüz tanımlanmamış!",
    };
  }

  async binInstallmentQuery(
    _request: BINInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    return {
      confirm: false,
      installment_list: [],
    };
  }

  async allInstallmentQuery(
    _request: AllInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse> {
    return {
      confirm: false,
      installments: [],
    };
  }

  async additionalInstallmentQuery(
    _request: AdditionalInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<AdditionalInstallmentQueryResponse> {
    return {
      confirm: false,
      campaigns: [],
    };
  }

  async cancel(_request: CancelRequest, _auth: MerchantAuth): Promise<CancelResponse> {
    return {
      status: ResponseStatus.Error,
      message: "Bu banka için iptal metodu henüz tanımlanmamış!",
    };
  }

  async refund(_request: RefundRequest, _auth: MerchantAuth): Promise<RefundResponse> {
    return {
      status: ResponseStatus.Error,
      message: "Bu banka için iade metodu henüz tanımlanmamış!",
    };
  }

  async saleQuery(_request: SaleQueryRequest, _auth: MerchantAuth): Promise<SaleQueryResponse> {
    return {
      status: SaleQueryResponseStatus.Error,
      message: "Bu sanal pos için satış sorgulama işlemi şu an desteklenmiyor",
    };
  }
}
