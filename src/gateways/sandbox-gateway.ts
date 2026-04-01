import {
  ResponseStatus,
  SaleQueryResponseStatus,
  SaleResponseStatus,
} from "../domain/enums";
import type {
  AdditionalInstallmentCampaign,
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
import { BinService } from "../services/bin-service";
import { AbstractGateway } from "./abstract-gateway";

const hashString = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(10, "0").slice(0, 10);
};

const toIsoString = (): string => new Date().toISOString();

const buildTransactionId = (
  bank: BankDefinition,
  orderNumber: string,
  action: string,
): string =>
  `${bank.bank_code}-${action}-${hashString(`${orderNumber}:${action}`)}`;

const extractCallbackField = (
  responseArray: Record<string, unknown>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const candidate = responseArray[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
};

export class SandboxGateway extends AbstractGateway {
  constructor(bank: BankDefinition) {
    super(bank);
  }

  override async sale(
    request: SaleRequest,
    _auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const orderNumber = request.order_number ?? "ORDER";

    if (request.payment_3d?.confirm) {
      const redirectTarget = `${request.payment_3d.return_url}?gateway=${this.bank.bank_code}&token=${hashString(orderNumber)}`;

      if (this.bank.three_d_response_type === "redirect_url") {
        return {
          status: SaleResponseStatus.RedirectURL,
          message: redirectTarget,
          order_number: orderNumber,
        };
      }

      return {
        status: SaleResponseStatus.RedirectHTML,
        order_number: orderNumber,
        message: `<!doctype html><html><body><form id="sanalpos-3d" action="${redirectTarget}" method="POST"><input type="hidden" name="orderId" value="${orderNumber}" /><input type="hidden" name="bankCode" value="${this.bank.bank_code}" /></form><script>document.getElementById('sanalpos-3d').submit();</script></body></html>`,
      };
    }

    return {
      status: SaleResponseStatus.Success,
      message: `${this.bank.bank_name} sandbox satış işlemi başarılı`,
      order_number: orderNumber,
      transaction_id: buildTransactionId(this.bank, orderNumber, "SALE"),
      private_response: {
        sandbox: true,
        gateway_family: this.bank.gateway_family,
      },
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    _auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const mdStatus = extractCallbackField(
      request.responseArray,
      "mdStatus",
      "mdstatus",
    );
    const processCode = extractCallbackField(
      request.responseArray,
      "procReturnCode",
      "ProcReturnCode",
      "responseCode",
    );
    const orderNumber =
      extractCallbackField(
        request.responseArray,
        "orderId",
        "oid",
        "OrderId",
      ) ?? "UNKNOWN";
    const transactionId =
      extractCallbackField(
        request.responseArray,
        "transId",
        "TransId",
        "txnId",
      ) ?? buildTransactionId(this.bank, orderNumber, "3D");

    if (
      ["1", "2", "3", "4"].includes(mdStatus ?? "") &&
      (!processCode || processCode === "00")
    ) {
      return {
        status: SaleResponseStatus.Success,
        message: `${this.bank.bank_name} 3D doğrulama başarılı`,
        order_number: orderNumber,
        transaction_id: transactionId,
        private_response: {
          sandbox: true,
          md_status: mdStatus,
          process_code: processCode ?? "00",
        },
      };
    }

    return {
      status: SaleResponseStatus.Error,
      message:
        extractCallbackField(
          request.responseArray,
          "ErrMsg",
          "mdErrorMsg",
          "message",
        ) ?? "3D doğrulama başarısız",
      order_number: orderNumber,
      transaction_id: transactionId,
      private_response: {
        sandbox: true,
        md_status: mdStatus ?? null,
        process_code: processCode ?? null,
      },
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    return BinService.query(request);
  }

  override async allInstallmentQuery(
    request: AllInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse> {
    const amount = request.amount ?? 100;
    const installments = [this.bank].map((bank) => ({
      bank_code: bank.bank_code,
      bank_name: bank.bank_name,
      installment_list: BinService.resolveInstallments(amount, [
        bank.bank_code,
      ]),
    }));

    return {
      confirm: installments.length > 0,
      installments,
      private_response: {
        sandbox: true,
      },
    };
  }

  override async additionalInstallmentQuery(
    request: AdditionalInstallmentQueryRequest,
    _auth: MerchantAuth,
  ): Promise<AdditionalInstallmentQueryResponse> {
    const baseInstallment = request.sale_info?.installment ?? 1;
    const campaigns: AdditionalInstallmentCampaign[] = [
      {
        code: `${this.bank.bank_code}-EXTRA-2`,
        title: `${this.bank.bank_name} +2 taksit kampanyası`,
        extra_installment: 2,
        total_installment: baseInstallment + 2,
      },
      {
        code: `${this.bank.bank_code}-EXTRA-3`,
        title: `${this.bank.bank_name} +3 taksit kampanyası`,
        extra_installment: 3,
        total_installment: baseInstallment + 3,
      },
    ];

    return {
      confirm: true,
      campaigns,
      private_response: {
        sandbox: true,
      },
    };
  }

  override async cancel(
    request: CancelRequest,
    _auth: MerchantAuth,
  ): Promise<CancelResponse> {
    return {
      status: this.bank.supports_cancel
        ? ResponseStatus.Success
        : ResponseStatus.Error,
      message: this.bank.supports_cancel
        ? `${this.bank.bank_name} sandbox iptal işlemi başarılı`
        : `${this.bank.bank_name} için iptal işlemi desteklenmiyor`,
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: {
        sandbox: true,
      },
    };
  }

  override async refund(
    request: RefundRequest,
    _auth: MerchantAuth,
  ): Promise<RefundResponse> {
    return {
      status: this.bank.supports_refund
        ? ResponseStatus.Success
        : ResponseStatus.Error,
      message: this.bank.supports_refund
        ? `${this.bank.bank_name} sandbox iade işlemi başarılı`
        : `${this.bank.bank_name} için iade işlemi desteklenmiyor`,
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: request.refund_amount,
      private_response: {
        sandbox: true,
      },
    };
  }

  override async saleQuery(
    request: SaleQueryRequest,
    _auth: MerchantAuth,
  ): Promise<SaleQueryResponse> {
    const orderNumber = request.order_number ?? "UNKNOWN";

    return {
      status: SaleQueryResponseStatus.Found,
      message: `${this.bank.bank_name} sandbox işlem kaydı bulundu`,
      order_number: orderNumber,
      transaction_id: buildTransactionId(this.bank, orderNumber, "QUERY"),
      transaction_date: toIsoString(),
      amount: 100,
    };
  }
}
