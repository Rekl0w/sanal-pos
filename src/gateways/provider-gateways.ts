import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";

import { BankCodes } from "../domain/banks";
import {
  CurrencyMap,
  ResponseStatus,
  SaleQueryResponseStatus,
  SaleResponseStatus,
} from "../domain/enums";
import type {
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
  SaleQueryResponse,
  SaleRequest,
  SaleResponse,
} from "../domain/types";
import { ccpaymentConfig, paytenConfig } from "../config/gateway-config";
import { HttpClient } from "../infra/http-client";
import {
  iyzicoFormatPrice,
  iyzicoHeaders,
  jwtHs512,
} from "../infra/iyzico-pki";
import {
  base64UrlDecode,
  clearNumber,
  currencyName,
  currencyNumericString,
  detectCardType,
  formatAmount,
  getFormParams,
  guid,
  parseSemicolonResponse,
  sha1Base64,
  sha256Hex,
  sha512Base64,
  toKurus,
} from "../infra/payment-utils";
import { buildXml, flattenXmlObject, parseXml } from "../infra/xml";
import { AbstractGateway } from "./abstract-gateway";

const saleInfoOf = (request: SaleRequest) => request.sale_info!;

class CCPaymentGateway extends AbstractGateway {
  private readonly config: {
    testBase: string;
    liveBase: string;
    skipPaymentStatusCheck?: boolean;
    cardProgramFieldName?: string;
  };

  constructor(bank: BankDefinition) {
    super(bank);
    this.config =
      ccpaymentConfig[bank.bank_code as keyof typeof ccpaymentConfig];
  }

  private baseUrl(auth: MerchantAuth): string {
    return auth.test_platform ? this.config.testBase : this.config.liveBase;
  }

  private async getToken(baseUrl: string, auth: MerchantAuth): Promise<string> {
    try {
      const raw = await HttpClient.postJson(`${baseUrl}/api/token`, {
        app_id: auth.merchant_user,
        app_secret: auth.merchant_password,
      });
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const data = (parsed.data as Record<string, unknown> | undefined) ?? {};
      return String(data.token ?? "");
    } catch {
      return "";
    }
  }

  private generateHashKey(
    total: string,
    installment: string,
    currencyCode: string,
    merchantKey: string,
    invoiceId: string,
    appSecret: string,
  ): string {
    const data = [
      total,
      installment,
      currencyCode,
      merchantKey,
      invoiceId,
    ].join("|");
    const iv = sha1Base64(String(Math.random())).slice(0, 16);
    const password = sha256Hex(appSecret).slice(0, 40);
    const salt = sha1Base64(String(Date.now())).slice(0, 4);
    const saltWithPassword = sha256Hex(password + salt).slice(0, 32);
    const cipher = createCipheriv(
      "aes-256-cbc",
      Buffer.from(saltWithPassword, "utf8"),
      Buffer.from(iv, "utf8"),
    );
    const encrypted =
      cipher.update(data, "utf8", "base64") + cipher.final("base64");
    return `${iv}:${salt}:${encrypted}`.replace(/\//g, "__");
  }

  private validateHashKey(
    hashKey: string,
    appSecret: string,
  ): string[] | false {
    try {
      const [iv, salt, encrypted] = hashKey.replace(/__/g, "/").split(":");
      if (!iv || !salt || !encrypted) {
        return false;
      }
      const password = sha256Hex(appSecret).slice(0, 40);
      const key = Buffer.from(sha256Hex(password + salt).slice(0, 32), "utf8");
      const decipher = createDecipheriv(
        "aes-256-cbc",
        key,
        Buffer.from(iv, "utf8"),
      );
      const decrypted =
        decipher.update(encrypted, "base64", "utf8") + decipher.final("utf8");
      return decrypted.split("|");
    } catch {
      return false;
    }
  }

  private async jsonRequest(
    url: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<Record<string, unknown>> {
    const raw = await HttpClient.postJson(
      url,
      body,
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    return JSON.parse(raw) as Record<string, unknown>;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }

    const saleInfo = saleInfoOf(request);
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    if (!token) {
      return {
        status: SaleResponseStatus.Error,
        message: "Token alınamadı",
        order_number: request.order_number,
      };
    }

    const total = formatAmount(saleInfo.amount ?? 0);
    const installment = String(
      (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
    );
    const currencyCode = String(saleInfo.currency ?? CurrencyMap.TRY);
    const body = {
      cc_holder_name: saleInfo.card_name_surname,
      cc_no: clearNumber(saleInfo.card_number),
      expiry_month: String(saleInfo.card_expiry_month).padStart(2, "0"),
      expiry_year: String(saleInfo.card_expiry_year),
      cvv: saleInfo.card_cvv,
      currency_code: currencyCode,
      installments_number: Number(installment),
      invoice_id: request.order_number,
      invoice_description: "",
      name: saleInfo.card_name_surname,
      surname: "",
      total,
      merchant_key: auth.merchant_storekey,
      items: [{ name: "Item", price: total, quantity: 1, description: "" }],
      hash_key: this.generateHashKey(
        total,
        installment,
        currencyCode,
        auth.merchant_storekey ?? "",
        request.order_number ?? "",
        auth.merchant_password ?? "",
      ),
      transaction_type: "Auth",
    };
    const result = await this.jsonRequest(
      `${baseUrl}/api/paySmart2D`,
      body,
      token,
    );
    const data = (result.data as Record<string, unknown> | undefined) ?? {};
    const paymentStatus = String(
      data.payment_status ?? result.payment_status ?? "",
    );
    const statusCode = String(result.status_code ?? "");
    const success =
      statusCode === "100" &&
      (paymentStatus === "1" || this.config.skipPaymentStatusCheck);

    return {
      status: success ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: success
        ? "İşlem başarılı"
        : String(
            result.status_description ??
              result.message ??
              "İşlem sırasında bir hata oluştu",
          ),
      order_number: request.order_number,
      transaction_id: success ? String(data.auth_code ?? "") : undefined,
      private_response: result,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = saleInfoOf(request);
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    if (!token) {
      return {
        status: SaleResponseStatus.Error,
        message: "Token alınamadı",
        order_number: request.order_number,
      };
    }
    const total = formatAmount(saleInfo.amount ?? 0);
    const installment = String(
      (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
    );
    const currencyCode = String(saleInfo.currency ?? CurrencyMap.TRY);
    const body = {
      cc_holder_name: saleInfo.card_name_surname,
      cc_no: clearNumber(saleInfo.card_number),
      expiry_month: String(saleInfo.card_expiry_month).padStart(2, "0"),
      expiry_year: String(saleInfo.card_expiry_year),
      cvv: saleInfo.card_cvv,
      currency_code: currencyCode,
      installments_number: Number(installment),
      invoice_id: request.order_number,
      invoice_description: "",
      name: saleInfo.card_name_surname,
      surname: "",
      total,
      merchant_key: auth.merchant_storekey,
      items: [{ name: "Item", price: total, quantity: 1, description: "" }],
      hash_key: this.generateHashKey(
        total,
        installment,
        currencyCode,
        auth.merchant_storekey ?? "",
        request.order_number ?? "",
        auth.merchant_password ?? "",
      ),
      transaction_type: "Auth",
      response_method: "POST",
      payment_completed_by: "app",
      ip: request.customer_ip_address,
      cancel_url: request.payment_3d?.return_url,
      return_url: request.payment_3d?.return_url,
    };
    const raw = await HttpClient.postJson(`${baseUrl}/api/paySmart3D`, body, {
      Authorization: `Bearer ${token}`,
    });
    return {
      status: SaleResponseStatus.RedirectHTML,
      message: raw,
      order_number: request.order_number,
      private_response: { stringResponse: raw },
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    const orderNumber = String(ra.invoice_id ?? "");
    const tx = String(ra.auth_code ?? "");
    const hashKey = String(ra.hash_key ?? "");
    if (hashKey) {
      const validated = this.validateHashKey(
        hashKey,
        auth.merchant_password ?? "",
      );
      if (validated === false || !validated.includes(orderNumber)) {
        return {
          status: SaleResponseStatus.Error,
          message: "Hash doğrulanamadı, ödeme onaylanmadı.",
          order_number: orderNumber,
          transaction_id: tx,
          private_response: ra,
        };
      }
    }
    const paymentStatus = String(ra.payment_status ?? "");
    const statusCode = String(ra.status_code ?? "");
    const success =
      paymentStatus === "1" ||
      (this.config.skipPaymentStatusCheck && statusCode === "100");
    return {
      status: success ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: success
        ? "İşlem başarılı"
        : String(
            ra.error ??
              ra.status_description ??
              "İşlem sırasında bir hata oluştu",
          ),
      order_number: orderNumber,
      transaction_id: tx,
      private_response: ra,
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    const result = await this.jsonRequest(
      `${baseUrl}/api/refund`,
      {
        invoice_id: request.order_number,
        amount: 0,
        app_id: auth.merchant_user,
        app_secret: auth.merchant_password,
        merchant_key: auth.merchant_storekey,
        hash_key: "",
      },
      token,
    );
    return {
      status:
        String(result.status_code ?? "") === "100"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        String(result.status_code ?? "") === "100"
          ? "İşlem başarılı"
          : String(result.status_description ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    const result = await this.jsonRequest(
      `${baseUrl}/api/refund`,
      {
        invoice_id: request.order_number,
        amount: formatAmount(request.refund_amount ?? 0),
        app_id: auth.merchant_user,
        app_secret: auth.merchant_password,
        merchant_key: auth.merchant_storekey,
        hash_key: "",
      },
      token,
    );
    const success = String(result.status_code ?? "") === "100";
    return {
      status: success ? ResponseStatus.Success : ResponseStatus.Error,
      message: success
        ? "İşlem başarılı"
        : String(result.status_description ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: success ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    const result = await this.jsonRequest(
      `${baseUrl}/api/getpos`,
      {
        credit_card: request.BIN,
        amount: formatAmount(request.amount ?? 0),
        currency_code: String(request.currency ?? CurrencyMap.TRY),
        merchant_key: auth.merchant_storekey,
      },
      token,
    );
    const data = Array.isArray(result.data) ? result.data : [];
    const installment_list = data.flatMap((item) => {
      const typed = item as Record<string, unknown>;
      const count = Number(typed.installments_number ?? 0);
      if (count <= 1) {
        return [];
      }
      const total = Number(typed.payable_amount ?? 0);
      const amount = request.amount ?? 0;
      const rate = amount > 0 ? ((total - amount) / amount) * 100 : 0;
      return [
        {
          installment: count,
          rate: Number(rate.toFixed(2)),
          total_amount: total,
        },
      ];
    });
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: result,
    };
  }

  override async allInstallmentQuery(
    request: AllInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse> {
    const baseUrl = this.baseUrl(auth);
    const token = await this.getToken(baseUrl, auth);
    const result = await this.jsonRequest(
      `${baseUrl}/api/commissions`,
      {
        currency_code: String(request.currency ?? CurrencyMap.TRY),
      },
      token,
    );
    const field = this.config.cardProgramFieldName ?? "card_program";
    const rows = Array.isArray(result.data) ? result.data : [];
    const groups = new Map<
      string,
      {
        bank_code: string;
        bank_name: string;
        installment_list: Array<{
          installment: number;
          rate: number;
          total_amount: number;
        }>;
      }
    >();
    for (const row of rows) {
      const item = row as Record<string, unknown>;
      const key = String(item[field] ?? "Other");
      const existing = groups.get(key) ?? {
        bank_code: this.bank.bank_code,
        bank_name: key,
        installment_list: [],
      };
      existing.installment_list.push({
        installment: Number(item.installments_number ?? 0),
        rate: Number(item.merchant_commission_rate ?? 0),
        total_amount: request.amount ?? 0,
      });
      groups.set(key, existing);
    }
    return {
      confirm: groups.size > 0,
      installments: [...groups.values()],
      private_response: result,
    };
  }

  override async additionalInstallmentQuery(): Promise<AdditionalInstallmentQueryResponse> {
    return { confirm: false, campaigns: [] };
  }

  override async saleQuery(): Promise<SaleQueryResponse> {
    return {
      status: SaleQueryResponseStatus.Error,
      message: "Bu sanal pos için satış sorgulama işlemi şuan desteklenmiyor",
    };
  }
}

class PaytenGateway extends AbstractGateway {
  private readonly config: {
    apiTest: string;
    apiLive: string;
    threeDTest: string;
    threeDLive: string;
    brandName: string;
    onlineMetrixOrgId?: string;
  };

  constructor(bank: BankDefinition) {
    super(bank);
    this.config = paytenConfig[bank.bank_code as keyof typeof paytenConfig];
  }

  private apiUrl(auth: MerchantAuth): string {
    return auth.test_platform ? this.config.apiTest : this.config.apiLive;
  }
  private threeDUrl(auth: MerchantAuth, token: string): string {
    return (
      auth.test_platform ? this.config.threeDTest : this.config.threeDLive
    ).replace("{0}", token);
  }

  private async post(
    params: Record<string, string>,
    auth: MerchantAuth,
  ): Promise<Record<string, unknown>> {
    const raw = await HttpClient.postForm(this.apiUrl(auth), params);
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private errorDesc(code: string): string {
    const brand = this.config.brandName;
    const map: Record<string, string> = {
      ERR10147: `${brand} tarafından ödeme alınamadı. İşlem reddedildi.`,
      ERR10153: `${brand} tarafından ödeme alınamadı. Token süresi dolmuş.`,
      ERR10170: `${brand} tarafından ödeme alınamadı. Ödeme zaman aşımına uğradı.`,
      ERR10001: "Geçersiz istek. Lütfen parametreleri kontrol ediniz.",
      ERR10003: "Yetkilendirme hatası. Üye işyeri bilgileri hatalı.",
      ERR10004: "İşlem bulunamadı.",
      ERR10005: "İşlem durumu uygun değil.",
      ERR10006: "Geçersiz tutar.",
      ERR10007: "Geçersiz kart numarası.",
      ERR10008: "Geçersiz son kullanma tarihi.",
      ERR10009: "Geçersiz CVV.",
      ERR10010: "Geçersiz taksit sayısı.",
      ERR10011: "Geçersiz para birimi.",
    };
    return (
      map[code] ?? `${brand} tarafından ödeme alınamadı. Hata kodu: ${code}`
    );
  }

  private async sessionToken(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<string> {
    const saleInfo = saleInfoOf(request);
    const raw = await HttpClient.postForm(this.apiUrl(auth), {
      ACTION: "SESSIONTOKEN",
      SESSIONTYPE: "PAYMENTSESSION",
      MERCHANT: auth.merchant_id ?? "",
      MERCHANTUSER: auth.merchant_user ?? "",
      MERCHANTPASSWORD: auth.merchant_password ?? "",
      CUSTOMER: request.customer_ip_address ?? "",
      CUSTOMERNAME: saleInfo.card_name_surname ?? "",
      CUSTOMEREMAIL: request.invoice_info?.email_address ?? "",
      CUSTOMERIP: request.customer_ip_address ?? "",
      CUSTOMERPHONE: request.invoice_info?.phone_number ?? "",
      MERCHANTPAYMENTID: request.order_number ?? "",
      AMOUNT: formatAmount(saleInfo.amount ?? 0),
      CURRENCY: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
      INSTALLMENTS: String(saleInfo.installment ?? 1),
      RETURNURL: request.payment_3d?.return_url ?? "",
      ...(auth.merchant_storekey
        ? { DEALERTYPENAME: auth.merchant_storekey }
        : {}),
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return String(parsed.sessionToken ?? "");
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = saleInfoOf(request);
    const result = await this.post(
      {
        ACTION: "SALE",
        MERCHANTPAYMENTID: request.order_number ?? "",
        MERCHANTUSER: auth.merchant_user ?? "",
        MERCHANTPASSWORD: auth.merchant_password ?? "",
        MERCHANT: auth.merchant_id ?? "",
        CUSTOMER: request.customer_ip_address ?? "",
        CUSTOMERNAME: saleInfo.card_name_surname ?? "",
        CUSTOMERIP: request.customer_ip_address ?? "",
        CUSTOMEREMAIL: request.invoice_info?.email_address ?? "",
        CUSTOMERPHONE: request.invoice_info?.phone_number ?? "",
        CARDPAN: clearNumber(saleInfo.card_number),
        CARDEXPIRY: `${String(saleInfo.card_expiry_month).padStart(2, "0")}.${saleInfo.card_expiry_year}`,
        CARDCVV: saleInfo.card_cvv ?? "",
        CURRENCY: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
        AMOUNT: formatAmount(saleInfo.amount ?? 0),
        INSTALLMENTS: String(saleInfo.installment ?? 1),
        ...(auth.merchant_storekey
          ? { DEALERTYPENAME: auth.merchant_storekey }
          : {}),
      },
      auth,
    );
    const ok = String(result.responseCode ?? "") === "00";
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(
            result.errorCode
              ? this.errorDesc(String(result.errorCode))
              : (result.responseMsg ??
                  result.errorMsg ??
                  "İşlem sırasında bir hata oluştu"),
          ),
      order_number: request.order_number,
      transaction_id: ok ? String(result.pgTranId ?? "") : undefined,
      private_response: result,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const token = await this.sessionToken(request, auth);
    if (!token) {
      return {
        status: SaleResponseStatus.Error,
        message: "Oturum anahtarı alınamadı",
        order_number: request.order_number,
      };
    }
    const saleInfo = saleInfoOf(request);
    let html = await HttpClient.postForm(this.threeDUrl(auth, token), {
      pan: clearNumber(saleInfo.card_number),
      expiryMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
      expiryYear: String(saleInfo.card_expiry_year),
      cvv: saleInfo.card_cvv ?? "",
      installmentCount: String(saleInfo.installment ?? 1),
    });
    if (this.config.onlineMetrixOrgId) {
      const script = `<p style="background:url(https://h.online-metrix.net/fp/clear.png?org_id=${this.config.onlineMetrixOrgId}&session_id=${token}&m=1)"></p><img src="https://h.online-metrix.net/fp/clear.png?org_id=${this.config.onlineMetrixOrgId}&session_id=${token}&m=2" alt=""><script src="https://h.online-metrix.net/fp/check.js?org_id=${this.config.onlineMetrixOrgId}&session_id=${token}" type="text/javascript"></script><object type="application/x-shockwave-flash" data="https://h.online-metrix.net/fp/fp.swf?org_id=${this.config.onlineMetrixOrgId}&session_id=${token}" width="1" height="1"><param name="movie" value="https://h.online-metrix.net/fp/fp.swf?org_id=${this.config.onlineMetrixOrgId}&session_id=${token}"></object>`;
      html = html.includes("</body>")
        ? html.replace("</body>", `${script}</body>`)
        : `${html}${script}`;
    }
    return {
      status: SaleResponseStatus.RedirectHTML,
      message: html,
      order_number: request.order_number,
      private_response: { htmlResponse: html.slice(0, 500) },
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    const ok = String(ra.responseCode ?? "") === "00";
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(
            ra.errorCode
              ? this.errorDesc(String(ra.errorCode))
              : (ra.pgTranErrorText ??
                  ra.errorMsg ??
                  "İşlem sırasında bir hata oluştu"),
          ),
      order_number: String(ra.merchantPaymentId ?? ""),
      transaction_id: String(ra.pgTranId ?? ""),
      private_response: ra,
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const result = await this.post(
      {
        ACTION: "VOID",
        MERCHANT: auth.merchant_id ?? "",
        MERCHANTUSER: auth.merchant_user ?? "",
        MERCHANTPASSWORD: auth.merchant_password ?? "",
        PGTRANID: request.transaction_id ?? "",
        REFLECTCOMMISSION: "No",
      },
      auth,
    );
    const ok = String(result.responseCode ?? "") === "00";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(
            result.responseMsg ?? result.errorMsg ?? "İşlem iptal edilemedi",
          ),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const result = await this.post(
      {
        ACTION: "REFUND",
        MERCHANT: auth.merchant_id ?? "",
        MERCHANTUSER: auth.merchant_user ?? "",
        MERCHANTPASSWORD: auth.merchant_password ?? "",
        PGTRANID: request.transaction_id ?? "",
        AMOUNT: formatAmount(request.refund_amount ?? 0),
        CURRENCY: String(request.currency ?? CurrencyMap.TRY),
        REFLECTCOMMISSION: "No",
      },
      auth,
    );
    const ok = String(result.responseCode ?? "") === "00";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(
            result.responseMsg ?? result.errorMsg ?? "İşlem iade edilemedi",
          ),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const result = await this.post(
      {
        ACTION: "QUERYBIN",
        MERCHANT: auth.merchant_id ?? "",
        MERCHANTUSER: auth.merchant_user ?? "",
        MERCHANTPASSWORD: auth.merchant_password ?? "",
        BIN: request.BIN ?? "",
        AMOUNT: formatAmount(request.amount ?? 0),
        CURRENCY: String(request.currency ?? CurrencyMap.TRY),
      },
      auth,
    );
    const plans = Array.isArray(result.installmentPaymentPlanList)
      ? result.installmentPaymentPlanList
      : [];
    const installment_list = plans.flatMap((plan) => {
      const item = plan as Record<string, unknown>;
      const count = Number(item.count ?? 0);
      if (count <= 1) return [];
      return [
        {
          installment: count,
          rate: Number(item.customerCostCommissionRate ?? 0),
          total_amount: Number(item.totalAmount ?? 0),
        },
      ];
    });
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: result,
    };
  }
}

class ParamPosGateway extends AbstractGateway {
  private readonly test =
    "https://testposws.param.com.tr/turkpos.ws/service_turkpos_prod.asmx";
  private readonly live =
    "https://posws.param.com.tr/turkpos.ws/service_turkpos_prod.asmx";
  private baseUrl(auth: MerchantAuth): string {
    return auth.test_platform ? this.test : this.live;
  }

  private async soapRequest(
    auth: MerchantAuth,
    body: string,
    action: string,
  ): Promise<Record<string, unknown>> {
    const raw = await HttpClient.postRaw(this.baseUrl(auth), body, {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: action,
    });
    return flattenXmlObject(parseXml(raw));
  }

  private saleXml(
    auth: MerchantAuth,
    request: SaleRequest,
    guidValue: string,
    hash: string,
    securityType: string,
    installment: number,
    amount: string,
    totalAmount: string,
  ): string {
    const saleInfo = saleInfoOf(request);
    const expiry = `${String(saleInfo.card_expiry_month).padStart(2, "0")}/${saleInfo.card_expiry_year}`;
    return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TP_WMD_UCD xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guidValue}</GUID><KK_Sahibi>${saleInfo.card_name_surname}</KK_Sahibi><KK_No>${clearNumber(saleInfo.card_number)}</KK_No><KK_SK>${expiry}</KK_SK><KK_CVC>${saleInfo.card_cvv}</KK_CVC><KK_Sahibi_GSM></KK_Sahibi_GSM><Hata_URL>${request.payment_3d?.return_url ?? ""}</Hata_URL><Basarili_URL>${request.payment_3d?.return_url ?? ""}</Basarili_URL><Siparis_ID>${request.order_number}</Siparis_ID><Siparis_Aciklama></Siparis_Aciklama><Taksit>${installment}</Taksit><Islem_Tutar>${amount}</Islem_Tutar><Toplam_Tutar>${totalAmount}</Toplam_Tutar><Islem_Hash>${hash}</Islem_Hash><Islem_Guvenlik_Tip>${securityType}</Islem_Guvenlik_Tip><Islem_ID></Islem_ID><IPAdr>${request.customer_ip_address}</IPAdr><Ref_URL></Ref_URL><Data1></Data1><Data2></Data2><Data3></Data3><Data4></Data4><Data5></Data5></TP_WMD_UCD></soap:Body></soap:Envelope>`;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const guidValue = guid();
    const saleInfo = saleInfoOf(request);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? (saleInfo.installment ?? 1) : 1;
    const amount = formatAmount(saleInfo.amount ?? 0);
    let totalAmount = amount;
    if (installment > 1) {
      const comm = await this.getInstallmentAmount(
        auth,
        clearNumber(saleInfo.card_number),
        installment,
        amount,
      );
      totalAmount = comm || amount;
    }
    const hash = sha1Base64(
      `${auth.merchant_id}${guidValue}${installment}${amount}${totalAmount}${request.order_number ?? ""}`,
    );
    const is3D = request.payment_3d?.confirm === true;
    const xml = this.saleXml(
      auth,
      request,
      guidValue,
      hash,
      is3D ? "3D" : "NS",
      installment,
      amount,
      totalAmount,
    );
    const result = await this.soapRequest(
      auth,
      xml,
      "https://turkpos.com.tr/TP_WMD_UCD",
    );
    const sonuc = Number(result.Sonuc ?? -1);
    const html = String(result.UCD_HTML ?? "");
    const islemId = Number(result.Islem_ID ?? 0);
    if (sonuc > 0) {
      if (!is3D && html === "NONSECURE" && islemId > 0) {
        return {
          status: SaleResponseStatus.Success,
          message: "İşlem başarılı",
          order_number: request.order_number,
          transaction_id: String(islemId),
          private_response: result,
        };
      }
      if (is3D && html && html !== "NONSECURE") {
        return {
          status: SaleResponseStatus.RedirectHTML,
          message: html,
          order_number: request.order_number,
          private_response: result,
        };
      }
    }
    return {
      status: SaleResponseStatus.Error,
      message: String(result.Sonuc_Str ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const mdStatus = Number(request.responseArray.mdStatus ?? 0);
    const md = String(request.responseArray.md ?? "");
    const islemGUID = String(request.responseArray.islemGUID ?? "");
    const orderId = String(request.responseArray.orderId ?? "");
    if (mdStatus !== 1 || !md || !islemGUID) {
      return {
        status: SaleResponseStatus.Error,
        message: `3D doğrulaması başarısız. mdStatus: ${mdStatus}`,
        order_number: orderId,
        private_response: { response_1: request.responseArray },
      };
    }
    const guidValue = guid();
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TP_WMD_Pay xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guidValue}</GUID><UCD_MD>${md}</UCD_MD><Islem_GUID>${islemGUID}</Islem_GUID><Siparis_ID>${orderId}</Siparis_ID></TP_WMD_Pay></soap:Body></soap:Envelope>`;
    const result = await this.soapRequest(
      auth,
      xml,
      "https://turkpos.com.tr/TP_WMD_Pay",
    );
    const ok =
      Number(result.Sonuc ?? -1) > 0 && Number(result.Dekont_ID ?? 0) > 0;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.Sonuc_Str ?? "İşlem tamamlanamadı"),
      order_number: orderId,
      transaction_id: ok ? String(result.Dekont_ID ?? "") : undefined,
      private_response: {
        response_1: request.responseArray,
        response_2: result,
      },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TP_Islem_Iptal_Iade_Kismi2 xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guid()}</GUID><Durum>IPTAL</Durum><Dekont_ID>${request.transaction_id}</Dekont_ID><Tutar>0.00</Tutar><Siparis_ID>${request.order_number}</Siparis_ID></TP_Islem_Iptal_Iade_Kismi2></soap:Body></soap:Envelope>`;
    const result = await this.soapRequest(
      auth,
      xml,
      "https://turkpos.com.tr/TP_Islem_Iptal_Iade_Kismi2",
    );
    const ok = Number(result.Sonuc ?? -1) > 0;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.Sonuc_Str ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TP_Islem_Iptal_Iade_Kismi2 xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guid()}</GUID><Durum>IADE</Durum><Dekont_ID>${request.transaction_id}</Dekont_ID><Tutar>${formatAmount(request.refund_amount ?? 0)}</Tutar><Siparis_ID>${request.order_number}</Siparis_ID></TP_Islem_Iptal_Iade_Kismi2></soap:Body></soap:Envelope>`;
    const result = await this.soapRequest(
      auth,
      xml,
      "https://turkpos.com.tr/TP_Islem_Iptal_Iade_Kismi2",
    );
    const ok = Number(result.Sonuc ?? -1) > 0;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.Sonuc_Str ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const base = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><BIN_SanalPos xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guid()}</GUID><BIN>${request.BIN}</BIN></BIN_SanalPos></soap:Body></soap:Envelope>`;
    const binResult = await this.soapRequest(
      auth,
      base,
      "https://turkpos.com.tr/BIN_SanalPos",
    );
    const sanalPosId = String(binResult.SanalPOS_ID ?? "");
    if (!sanalPosId || sanalPosId === "0") {
      return {
        confirm: false,
        installment_list: [],
        private_response: binResult,
      };
    }
    const installmentsXml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><TP_Ozel_Oran_SK_Liste xmlns="https://turkpos.com.tr/"><G><CLIENT_CODE>${auth.merchant_id}</CLIENT_CODE><CLIENT_USERNAME>${auth.merchant_user}</CLIENT_USERNAME><CLIENT_PASSWORD>${auth.merchant_password}</CLIENT_PASSWORD></G><GUID>${guid()}</GUID><SanalPOS_ID>${sanalPosId}</SanalPOS_ID></TP_Ozel_Oran_SK_Liste></soap:Body></soap:Envelope>`;
    const rates = await this.soapRequest(
      auth,
      installmentsXml,
      "https://turkpos.com.tr/TP_Ozel_Oran_SK_Liste",
    );
    const installment_list = Array.from(
      { length: 11 },
      (_, index) => index + 2,
    ).flatMap((installment) => {
      const rate = Number(
        rates[`MO_${String(installment).padStart(2, "0")}`] ?? 0,
      );
      if (rate <= 0) return [];
      const total = Number(
        ((request.amount ?? 0) * (1 + rate / 100)).toFixed(2),
      );
      return [{ installment, rate, total_amount: total }];
    });
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: { ...binResult, installments: rates },
    };
  }

  private async getInstallmentAmount(
    auth: MerchantAuth,
    cardNumber: string,
    installment: number,
    amount: string,
  ): Promise<string> {
    try {
      const result = await this.binInstallmentQuery(
        { BIN: cardNumber.slice(0, 6), amount: Number(amount) },
        auth,
      );
      const matched = result.installment_list.find(
        (item) => item.installment === installment,
      );
      return matched ? formatAmount(matched.total_amount) : amount;
    } catch {
      return amount;
    }
  }
}

class MokaGateway extends AbstractGateway {
  private readonly test = "https://service.refmoka.com";
  private readonly live = "https://service.moka.com";
  private baseUrl(auth: MerchantAuth) {
    return auth.test_platform ? this.test : this.live;
  }
  private checkKey(auth: MerchantAuth) {
    return sha256Hex(
      `${auth.merchant_id}MK${auth.merchant_user}PD${auth.merchant_password}`,
    );
  }
  private async request(url: string, body: Record<string, unknown>) {
    return JSON.parse(await HttpClient.postJson(url, body)) as Record<
      string,
      unknown
    >;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) return this.sale3D(request, auth);
    const saleInfo = saleInfoOf(request);
    const result = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/DoDirectPayment`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: {
          CardHolderFullName: saleInfo.card_name_surname,
          CardNumber: clearNumber(saleInfo.card_number),
          ExpMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
          ExpYear: String(saleInfo.card_expiry_year),
          CvcNumber: saleInfo.card_cvv,
          Amount: formatAmount(saleInfo.amount ?? 0),
          Currency: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
          InstallmentNumber:
            (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
          ClientIP: request.customer_ip_address,
          OtherTrxCode: request.order_number,
          IsPoolPayment: 0,
          IsTokenized: 0,
          Software: "cp.vpos",
          IsPreAuth: 0,
        },
      },
    );
    const data = (result.Data as Record<string, unknown> | undefined) ?? {};
    const ok =
      String(result.ResultCode ?? "").toLowerCase() === "success" &&
      data.IsSuccessful === true;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.ResultCode ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id: ok ? String(data.VirtualPosOrderId ?? "") : undefined,
      private_response: result,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = saleInfoOf(request);
    const result = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/DoDirectPaymentThreeD`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: {
          CardHolderFullName: saleInfo.card_name_surname,
          CardNumber: clearNumber(saleInfo.card_number),
          ExpMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
          ExpYear: String(saleInfo.card_expiry_year),
          CvcNumber: saleInfo.card_cvv,
          Amount: formatAmount(saleInfo.amount ?? 0),
          Currency: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
          InstallmentNumber:
            (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
          ClientIP: request.customer_ip_address,
          OtherTrxCode: request.order_number,
          IsPoolPayment: 0,
          IsTokenized: 0,
          Software: "cp.vpos",
          IsPreAuth: 0,
          ReturnHash: 1,
          RedirectType: 0,
          RedirectUrl: request.payment_3d?.return_url,
        },
      },
    );
    const data = (result.Data as Record<string, unknown> | undefined) ?? {};
    const url = data.Url ?? result.Data;
    const ok =
      String(result.ResultCode ?? "").toLowerCase() === "success" && !!url;
    return {
      status: ok ? SaleResponseStatus.RedirectURL : SaleResponseStatus.Error,
      message: ok
        ? String(url)
        : String(result.ResultCode ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    if (ra.resultMessage) {
      return {
        status: SaleResponseStatus.Error,
        message: String(ra.resultMessage),
        order_number: String(ra.OtherTrxCode ?? ""),
        transaction_id: String(ra.trxCode ?? ""),
        private_response: ra,
      };
    }
    const detail = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/GetDealerPaymentTrxDetailList`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: { PaymentId: Number(ra.trxCode ?? 0) },
      },
    );
    const payment = (((detail.Data as Record<string, unknown> | undefined)
      ?.PaymentDetail as Array<Record<string, unknown>> | undefined) ?? [])[0];
    const ok =
      payment &&
      Number(payment.PaymentStatus ?? 0) === 2 &&
      Number(payment.TrxStatus ?? 0) === 1;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : "3D doğrulaması başarısız veya ödeme tamamlanamadı",
      order_number: String(ra.OtherTrxCode ?? ""),
      transaction_id: String(ra.trxCode ?? ""),
      private_response: { response_1: ra, response_2: detail },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const result = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/DoVoid`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: {
          VirtualPosOrderId: request.transaction_id,
          OtherTrxCode: request.order_number,
          VoidRefundReason: 2,
        },
      },
    );
    const ok = String(result.ResultCode ?? "").toLowerCase() === "success";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.ResultCode ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const result = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/DoCreateRefundRequest`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: {
          VirtualPosOrderId: request.transaction_id,
          OtherTrxCode: request.order_number,
          Amount: formatAmount(request.refund_amount ?? 0),
          VoidRefundReason: 2,
        },
      },
    );
    const ok = String(result.ResultCode ?? "").toLowerCase() === "success";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.ResultCode ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const result = await this.request(
      `${this.baseUrl(auth)}/PaymentDealer/GetIsInstallment`,
      {
        PaymentDealerAuthentication: {
          DealerCode: auth.merchant_id,
          Username: auth.merchant_user,
          Password: auth.merchant_password,
          CheckKey: this.checkKey(auth),
        },
        PaymentDealerRequest: { BinNumber: request.BIN },
      },
    );
    const cards =
      ((result.Data as Record<string, unknown> | undefined)?.BankCardList as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
    const installment_list = cards.flatMap((card) =>
      (
        (card.InstallmentList as Array<Record<string, unknown>> | undefined) ??
        []
      ).flatMap((inst) => {
        const count = Number(inst.InstallmentNumber ?? 0);
        if (count <= 1) return [];
        const rate = Number(inst.CommissionRate ?? 0);
        return [
          {
            installment: count,
            rate,
            total_amount: Number(
              ((request.amount ?? 0) * (1 + rate / 100)).toFixed(2),
            ),
          },
        ];
      }),
    );
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: result,
    };
  }
}

class PaynkolayGateway extends AbstractGateway {
  private readonly test = "https://paynkolaytest.nkolayislem.com.tr";
  private readonly live = "https://paynkolay.nkolayislem.com.tr";
  private baseUrl(auth: MerchantAuth) {
    return auth.test_platform ? this.test : this.live;
  }
  private async form(url: string, body: Record<string, string>) {
    return JSON.parse(await HttpClient.postForm(url, body)) as Record<
      string,
      unknown
    >;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = saleInfoOf(request);
    const is3D = request.payment_3d?.confirm === true;
    const amount = formatAmount(saleInfo.amount ?? 0);
    const rnd = new Date().toLocaleString("tr-TR");
    const hash = sha512Base64(
      [
        auth.merchant_id,
        request.order_number,
        amount,
        request.payment_3d?.return_url ?? "",
        request.payment_3d?.return_url ?? "",
        rnd,
        auth.merchant_storekey,
        auth.merchant_password,
      ].join("|"),
    );
    const result = await this.form(`${this.baseUrl(auth)}/Vpos/v1/Payment`, {
      sx: auth.merchant_id ?? "",
      clientRefCode: request.order_number ?? "",
      cardHolderName: saleInfo.card_name_surname ?? "",
      cardNo: clearNumber(saleInfo.card_number),
      month: String(saleInfo.card_expiry_month).padStart(2, "0"),
      year: String(saleInfo.card_expiry_year),
      cvc: saleInfo.card_cvv ?? "",
      amount,
      currency: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
      installmentCount: String(
        (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
      ),
      transactionType: "SALES",
      environment: "API",
      customerKey: auth.merchant_storekey ?? "",
      rnd,
      hash,
      use3D: is3D ? "true" : "false",
      ...(is3D
        ? {
            successUrl: request.payment_3d?.return_url ?? "",
            failUrl: request.payment_3d?.return_url ?? "",
          }
        : {}),
    });
    const code = Number(result.RESPONSE_CODE ?? 0);
    if (code === 2) {
      if (is3D && String(result.USE_3D ?? "") === "true") {
        return {
          status: SaleResponseStatus.RedirectHTML,
          message: decodeURIComponent(
            String(result.BANK_REQUEST_MESSAGE ?? ""),
          ),
          order_number: request.order_number,
          private_response: result,
        };
      }
      if (String(result.AUTH_CODE ?? "0") !== "0") {
        return {
          status: SaleResponseStatus.Success,
          message: "İşlem başarılı",
          order_number: request.order_number,
          transaction_id: String(result.REFERENCE_CODE ?? ""),
          private_response: result,
        };
      }
    }
    return {
      status: SaleResponseStatus.Error,
      message: String(result.RESPONSE_MSG ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    if (Number(ra.RESPONSE_CODE ?? 0) !== 2 || !ra.REFERENCE_CODE) {
      return {
        status: SaleResponseStatus.Error,
        message: String(ra.RESPONSE_MSG ?? "3D doğrulaması başarısız"),
        order_number: String(ra.CLIENT_REFERENCE_CODE ?? ""),
        private_response: ra,
      };
    }
    const result = await this.form(
      `${this.baseUrl(auth)}/Vpos/v1/CompletePayment`,
      {
        sx: auth.merchant_password ?? "",
        referenceCode: String(ra.REFERENCE_CODE ?? ""),
      },
    );
    const ok =
      Number(result.RESPONSE_CODE ?? 0) === 2 &&
      String(result.AUTH_CODE ?? "0") !== "0";
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.RESPONSE_MSG ?? "İşlem tamamlanamadı"),
      order_number: String(ra.CLIENT_REFERENCE_CODE ?? ""),
      transaction_id: ok
        ? String(result.REFERENCE_CODE ?? ra.REFERENCE_CODE ?? "")
        : undefined,
      private_response: { response_1: ra, response_2: result },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const rnd = new Date().toLocaleString("tr-TR");
    const hash = sha512Base64(
      [
        auth.merchant_password,
        request.transaction_id,
        "cancel",
        "0",
        "",
        auth.merchant_storekey,
      ].join("|"),
    );
    const result = await this.form(
      `${this.baseUrl(auth)}/Vpos/v1/CancelRefundPayment`,
      {
        sx: auth.merchant_password ?? "",
        referenceCode: request.transaction_id ?? "",
        type: "cancel",
        amount: "0",
        trxDate: "",
        hash,
        rnd,
      },
    );
    const ok = Number(result.RESPONSE_CODE ?? 0) === 2;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.RESPONSE_MSG ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const rnd = new Date().toLocaleString("tr-TR");
    const amount = formatAmount(request.refund_amount ?? 0);
    const hash = sha512Base64(
      [
        auth.merchant_password,
        request.transaction_id,
        "refund",
        amount,
        "",
        auth.merchant_storekey,
      ].join("|"),
    );
    const result = await this.form(
      `${this.baseUrl(auth)}/Vpos/v1/CancelRefundPayment`,
      {
        sx: auth.merchant_password ?? "",
        referenceCode: request.transaction_id ?? "",
        type: "refund",
        amount,
        trxDate: "",
        hash,
        rnd,
      },
    );
    const ok = Number(result.RESPONSE_CODE ?? 0) === 2;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.RESPONSE_MSG ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async allInstallmentQuery(
    _request: AllInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<AllInstallmentQueryResponse> {
    const result = await this.form(
      `${this.baseUrl(auth)}/Vpos/Payment/GetMerchandInformation`,
      { sx: auth.merchant_id ?? "" },
    );
    const commissions = Array.isArray(result.COMMISSIONS)
      ? result.COMMISSIONS
      : [];
    const groups = new Map<
      string,
      {
        bank_code: string;
        bank_name: string;
        installment_list: Array<{
          installment: number;
          rate: number;
          total_amount: number;
        }>;
      }
    >();
    for (const commission of commissions) {
      const item = commission as Record<string, unknown>;
      const program = String(item.CARD_PROGRAM ?? "Other");
      const current = groups.get(program) ?? {
        bank_code: this.bank.bank_code,
        bank_name: program,
        installment_list: [],
      };
      current.installment_list.push({
        installment: Number(item.INSTALLMENT ?? 0),
        rate: Number(item.COMMISSION_RATE ?? 0),
        total_amount: 0,
      });
      groups.set(program, current);
    }
    return {
      confirm: groups.size > 0,
      installments: [...groups.values()],
      private_response: result,
    };
  }
}

class AhlpayGateway extends AbstractGateway {
  private readonly test = "https://testahlsanalpos.ahlpay.com.tr";
  private readonly live = "https://ahlsanalpos.ahlpay.com.tr";
  private baseUrl(auth: MerchantAuth) {
    return auth.test_platform ? this.test : this.live;
  }

  private async authenticate(
    auth: MerchantAuth,
  ): Promise<{ token: string; tokenType: string; merchantId: string }> {
    try {
      const raw = await HttpClient.postJson(
        `${this.baseUrl(auth)}/api/Security/AuthenticationMerchant`,
        { email: auth.merchant_user, password: auth.merchant_password },
      );
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const data = (parsed.data as Record<string, unknown> | undefined) ?? {};
      return {
        token: String(data.token ?? ""),
        tokenType: String(data.tokenType ?? "Bearer"),
        merchantId: String(data.merchantId ?? ""),
      };
    } catch {
      return { token: "", tokenType: "Bearer", merchantId: "" };
    }
  }

  private hash(
    storeKey: string,
    rnd: string,
    orderId: string,
    totalAmount: string,
    merchantId: string,
  ): string {
    return sha256Hex(
      `${storeKey}${rnd}${orderId}${totalAmount}${merchantId}`,
    ).toUpperCase();
  }

  private async authedRequest(
    path: string,
    auth: MerchantAuth,
    tokenData: { token: string; tokenType: string },
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const raw = await HttpClient.postJson(
      `${this.baseUrl(auth)}${path}`,
      body,
      tokenData.token
        ? { Authorization: `${tokenData.tokenType} ${tokenData.token}` }
        : {},
    );
    return JSON.parse(raw) as Record<string, unknown>;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) return this.sale3D(request, auth);
    const token = await this.authenticate(auth);
    if (!token.token)
      return {
        status: SaleResponseStatus.Error,
        message: "Token alınamadı",
        order_number: request.order_number,
      };
    const saleInfo = saleInfoOf(request);
    const totalAmount = toKurus(saleInfo.amount ?? 0);
    const rnd = `RND${request.order_number ?? ""}`;
    const result = await this.authedRequest(
      "/api/Payment/PaymentNon3D",
      auth,
      token,
      {
        txnType: "Auth",
        totalAmount,
        orderId: request.order_number,
        memberId: token.merchantId,
        rnd,
        hash: this.hash(
          auth.merchant_storekey ?? "",
          rnd,
          request.order_number ?? "",
          totalAmount,
          token.merchantId,
        ),
        cardOwner: saleInfo.card_name_surname,
        cardNumber: clearNumber(saleInfo.card_number),
        cardExpireMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
        cardExpireYear: String(saleInfo.card_expiry_year),
        installment: (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
        cvv: saleInfo.card_cvv,
        currency: String(saleInfo.currency ?? CurrencyMap.TRY),
        customerIp: request.customer_ip_address,
      },
    );
    const ok = result.isSuccess === true;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.message ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id: ok
        ? String(
            (result.data as Record<string, unknown> | undefined)?.authCode ??
              "",
          )
        : undefined,
      private_response: result,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const token = await this.authenticate(auth);
    if (!token.token)
      return {
        status: SaleResponseStatus.Error,
        message: "Token alınamadı",
        order_number: request.order_number,
      };
    const saleInfo = saleInfoOf(request);
    const totalAmount = toKurus(saleInfo.amount ?? 0);
    const rnd = `RND${request.order_number ?? ""}`;
    const result = await this.authedRequest(
      "/api/Payment/Payment3DConfigWithEventRedirect",
      auth,
      token,
      {
        txnType: "Auth",
        totalAmount,
        orderId: request.order_number,
        memberId: token.merchantId,
        rnd,
        hash: this.hash(
          auth.merchant_storekey ?? "",
          rnd,
          request.order_number ?? "",
          totalAmount,
          token.merchantId,
        ),
        cardOwner: saleInfo.card_name_surname,
        cardNumber: clearNumber(saleInfo.card_number),
        cardExpireMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
        cardExpireYear: String(saleInfo.card_expiry_year),
        installment: (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
        cvv: saleInfo.card_cvv,
        currency: String(saleInfo.currency ?? CurrencyMap.TRY),
        customerIp: request.customer_ip_address,
        okUrl: request.payment_3d?.return_url,
        failUrl: request.payment_3d?.return_url,
      },
    );
    const ok = result.isSuccess === true;
    return {
      status: ok ? SaleResponseStatus.RedirectHTML : SaleResponseStatus.Error,
      message: ok
        ? String(result.data ?? "")
        : String(result.message ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const token = await this.authenticate(auth);
    const orderId = String(request.responseArray.orderId ?? "");
    const rnd = String(request.responseArray.rnd ?? "");
    const result = await this.authedRequest(
      "/api/Payment/PaymentInquiry",
      auth,
      token,
      { orderId, rnd },
    );
    const ok = result.isSuccess === true;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.message ?? "İşlem sırasında bir hata oluştu"),
      order_number: orderId,
      transaction_id: ok
        ? String(
            (result.data as Record<string, unknown> | undefined)?.authCode ??
              "",
          )
        : undefined,
      private_response: {
        response_1: request.responseArray,
        response_2: result,
      },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const token = await this.authenticate(auth);
    const result = await this.authedRequest("/api/Payment/Void", auth, token, {
      txnType: "Void",
      orderId: request.order_number,
      totalAmount: "999999900",
    });
    const ok = result.isSuccess === true;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.message ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const token = await this.authenticate(auth);
    const result = await this.authedRequest(
      "/api/Payment/Refund",
      auth,
      token,
      {
        txnType: "Refund",
        orderId: request.order_number,
        totalAmount: toKurus(request.refund_amount ?? 0),
      },
    );
    const ok = result.isSuccess === true;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.message ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }
}

class IyzicoGateway extends AbstractGateway {
  private readonly test = "https://sandbox-api.iyzipay.com";
  private readonly live = "https://api.iyzipay.com";
  private baseUrl(auth: MerchantAuth) {
    return auth.test_platform ? this.test : this.live;
  }
  private async post(
    auth: MerchantAuth,
    path: string,
    body: Record<string, unknown>,
  ) {
    const raw = await HttpClient.postJson(
      `${this.baseUrl(auth)}${path}`,
      body,
      iyzicoHeaders(
        auth.merchant_user ?? "",
        auth.merchant_password ?? "",
        body,
      ),
    );
    return JSON.parse(raw) as Record<string, unknown>;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = saleInfoOf(request);
    const amount = iyzicoFormatPrice(saleInfo.amount ?? 0);
    const invoice = request.invoice_info ?? {};
    const shipping = request.shipping_info ?? {};
    const body: Record<string, unknown> = {
      locale: "tr",
      conversationId: request.order_number,
      price: amount,
      paidPrice: amount,
      currency: currencyName(saleInfo.currency ?? CurrencyMap.TRY),
      installment: saleInfo.installment ?? 1,
      basketId: request.order_number,
      paymentCard: {
        cardHolderName: saleInfo.card_name_surname,
        cardNumber: clearNumber(saleInfo.card_number),
        expireMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
        expireYear: String(saleInfo.card_expiry_year),
        cvc: saleInfo.card_cvv,
      },
      buyer: {
        id: invoice.email_address ?? "buyer@test.com",
        name: invoice.name ?? "Müşteri",
        surname: invoice.surname ?? invoice.name ?? "Müşteri",
        gsmNumber: invoice.phone_number ?? "",
        email: invoice.email_address ?? "",
        identityNumber: invoice.tax_number ?? "11111111111",
        registrationAddress: invoice.address_description ?? "",
        ip: request.customer_ip_address ?? "1.1.1.1",
        city: invoice.city_name ?? "",
        country: invoice.country ?? "Turkey",
        zipCode: invoice.post_code ?? "",
      },
      shippingAddress: {
        contactName: shipping.name ?? saleInfo.card_name_surname,
        city: shipping.city_name ?? "",
        country: shipping.country ?? "Turkey",
        address: shipping.address_description ?? "",
        zipCode: shipping.post_code ?? "",
      },
      billingAddress: {
        contactName: invoice.name ?? saleInfo.card_name_surname,
        city: invoice.city_name ?? "",
        country: invoice.country ?? "Turkey",
        address: invoice.address_description ?? "",
        zipCode: invoice.post_code ?? "",
      },
      basketItems: [
        {
          id: "TAHSILAT",
          name: "Cari Tahsilat",
          category1: "Tahsilat",
          itemType: "VIRTUAL",
          price: amount,
        },
      ],
    };
    if (request.payment_3d?.confirm) {
      const result = await this.post(auth, "/payment/3dsecure/initialize", {
        ...body,
        callbackUrl: request.payment_3d.return_url,
      });
      const html = Buffer.from(
        String(result.threeDSHtmlContent ?? ""),
        "base64",
      ).toString("utf8");
      return {
        status:
          result.status === "success" && html
            ? SaleResponseStatus.RedirectHTML
            : SaleResponseStatus.Error,
        message:
          result.status === "success" && html
            ? html
            : String(result.errorMessage ?? "İşlem sırasında bir hata oluştu"),
        order_number: request.order_number,
        private_response: result,
      };
    }
    const result = await this.post(auth, "/payment/auth", body);
    const ok = result.status === "success";
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarıyla tamamlandı"
        : String(result.errorMessage ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id: ok ? String(result.paymentId ?? "") : undefined,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    if (ra.status === "success" && Number(ra.mdStatus ?? 0) === 1) {
      const result = await this.post(auth, "/payment/3dsecure/auth", {
        locale: "tr",
        conversationId: ra.conversationId,
        paymentId: ra.paymentId,
        conversationData: ra.conversationData,
      });
      const ok = String(result.status ?? "").toLowerCase() === "success";
      return {
        status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
        message: ok
          ? "Ödeme başarılı"
          : String(result.errorMessage ?? "İşlem tamamlanamadı"),
        order_number: String(ra.conversationId ?? ""),
        transaction_id: String(ra.paymentId ?? ""),
        private_response: { ...ra, threedsPayment: result },
      };
    }
    return {
      status: SaleResponseStatus.Error,
      message: "3D doğrulaması başarısız",
      order_number: String(ra.conversationId ?? ""),
      transaction_id: String(ra.paymentId ?? ""),
      private_response: ra,
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const result = await this.post(auth, "/payment/cancel", {
      conversationId: request.order_number,
      locale: "tr",
      paymentId: request.transaction_id,
      ip: request.customer_ip_address ?? "1.1.1.1",
    });
    const ok = result.status === "success";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İade işlemi başarılı"
        : String(result.errorMessage ?? "İptal işlemi başarısız"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const result = await this.post(auth, "/v2/payment/refund", {
      locale: "tr",
      conversationId: request.order_number,
      ip: request.customer_ip_address ?? "1.1.1.1",
      price: iyzicoFormatPrice(request.refund_amount ?? 0),
      paymentId: request.transaction_id,
    });
    const ok = result.status === "success";
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İade işlemi başarılı"
        : String(result.errorMessage ?? "İade işlemi başarısız"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok
        ? Number(result.price ?? request.refund_amount ?? 0)
        : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const result = await this.post(auth, "/payment/iyzipos/installment", {
      locale: "tr",
      conversationId: guid(),
      binNumber: request.BIN,
      price: iyzicoFormatPrice(request.amount ?? 0),
    });
    const details = Array.isArray(result.installmentDetails)
      ? result.installmentDetails
      : [];
    const prices =
      details.length > 0 &&
      typeof details[0] === "object" &&
      details[0] !== null
        ? (((details[0] as Record<string, unknown>).installmentPrices as
            | Array<Record<string, unknown>>
            | undefined) ?? [])
        : [];
    const installment_list = prices.flatMap((item) => {
      const installment = Number(item.installmentNumber ?? 0);
      if (installment <= 1) return [];
      const total = Number(item.totalPrice ?? request.amount ?? 0);
      const amount = request.amount ?? 0;
      const rate = amount > 0 ? ((total - amount) / amount) * 100 : 0;
      return [
        { installment, rate: Number(rate.toFixed(2)), total_amount: total },
      ];
    });
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: result,
    };
  }
}

class TamiGateway extends AbstractGateway {
  private readonly test = "https://sandbox-paymentapi.tami.com.tr";
  private readonly live = "https://paymentapi.tami.com.tr";
  private baseUrl(auth: MerchantAuth) {
    return auth.test_platform ? this.test : this.live;
  }
  private headers(auth: MerchantAuth): Record<string, string> {
    const authHash = createHmac("sha256", "")
      .update(
        `${auth.merchant_id}${auth.merchant_user}${auth.merchant_storekey}`,
      )
      .digest("base64");
    return {
      "Content-Type": "application/json",
      "PG-Auth-Token": `${auth.merchant_id}:${auth.merchant_user}:${authHash}`,
      "PG-Api-Version": "v3",
      "Accept-Language": "tr",
      correlationId: `Correlation${guid()}`,
    };
  }
  private signature(
    auth: MerchantAuth,
    payload: Record<string, unknown>,
  ): string {
    const [kid, raw] = String(auth.merchant_password ?? "").split("|");
    return jwtHs512(kid ?? "", base64UrlDecode(raw ?? ""), payload);
  }
  private async json(
    url: string,
    auth: MerchantAuth,
    body: Record<string, unknown>,
  ) {
    const raw = await HttpClient.postJson(url, body, this.headers(auth));
    return JSON.parse(raw) as Record<string, unknown>;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = saleInfoOf(request);
    const body: Record<string, unknown> = {
      orderId: request.order_number,
      amount: Number(formatAmount(saleInfo.amount ?? 0)),
      currency: currencyName(saleInfo.currency ?? CurrencyMap.TRY),
      installmentCount:
        (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 1,
      paymentGroup: "OTHER",
      card: {
        cardHolderName: saleInfo.card_name_surname,
        cardNumber: clearNumber(saleInfo.card_number),
        expireMonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
        expireYear: String(saleInfo.card_expiry_year),
        cvc: saleInfo.card_cvv,
      },
      buyer: {
        id: request.customer_ip_address,
        name: request.invoice_info?.name ?? "Müşteri",
        surname: request.invoice_info?.surname ?? "",
        email: request.invoice_info?.email_address ?? "",
        ip: request.customer_ip_address,
        identityNumber: request.invoice_info?.tax_number ?? "11111111111",
        phoneNumber: request.invoice_info?.phone_number ?? "",
        city: request.invoice_info?.city_name ?? "",
        country: "Turkey",
      },
      shippingAddress: {
        contactName: saleInfo.card_name_surname,
        address: request.invoice_info?.address_description ?? "",
        city: request.invoice_info?.city_name ?? "",
        country: "Turkey",
      },
      billingAddress: {
        contactName: saleInfo.card_name_surname,
        address: request.invoice_info?.address_description ?? "",
        city: request.invoice_info?.city_name ?? "",
        country: "Turkey",
      },
    };
    if (request.payment_3d?.confirm)
      body.callbackUrl = request.payment_3d.return_url;
    body.securityHash = this.signature(auth, body);
    const result = await this.json(
      `${this.baseUrl(auth)}/payment/auth`,
      auth,
      body,
    );
    const ok = result.success === true;
    if (ok && request.payment_3d?.confirm) {
      const html = Buffer.from(
        String(result.threeDSHtmlContent ?? ""),
        "base64",
      ).toString("utf8");
      return {
        status: html
          ? SaleResponseStatus.RedirectHTML
          : SaleResponseStatus.Error,
        message: html || "3D HTML içeriği alınamadı",
        order_number: request.order_number,
        private_response: result,
      };
    }
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(
            result.errorMessage ??
              result.message ??
              "İşlem sırasında bir hata oluştu",
          ),
      order_number: request.order_number,
      transaction_id: ok ? String(result.bankReferenceNumber ?? "") : undefined,
      private_response: result,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (![true, "true", "1"].includes(request.responseArray.success as never)) {
      return {
        status: SaleResponseStatus.Error,
        message: String(
          request.responseArray.errorMessage ?? "3D doğrulaması başarısız",
        ),
        order_number: String(request.responseArray.orderId ?? ""),
        private_response: request.responseArray,
      };
    }
    const body: Record<string, unknown> = {
      orderId: request.responseArray.orderId,
    };
    body.securityHash = this.signature(auth, body);
    const result = await this.json(
      `${this.baseUrl(auth)}/payment/complete-3ds`,
      auth,
      body,
    );
    const ok = result.success === true;
    return {
      status: ok ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.errorMessage ?? "İşlem tamamlanamadı"),
      order_number: String(request.responseArray.orderId ?? ""),
      transaction_id: ok ? String(result.bankReferenceNumber ?? "") : undefined,
      private_response: {
        response_1: request.responseArray,
        response_2: result,
      },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const body: Record<string, unknown> = { orderId: request.order_number };
    body.securityHash = this.signature(auth, body);
    const result = await this.json(
      `${this.baseUrl(auth)}/payment/reverse`,
      auth,
      body,
    );
    const ok = result.success === true;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.errorMessage ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: result,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const body: Record<string, unknown> = {
      orderId: request.order_number,
      amount: Number(formatAmount(request.refund_amount ?? 0)),
    };
    body.securityHash = this.signature(auth, body);
    const result = await this.json(
      `${this.baseUrl(auth)}/payment/reverse`,
      auth,
      body,
    );
    const ok = result.success === true;
    return {
      status: ok ? ResponseStatus.Success : ResponseStatus.Error,
      message: ok
        ? "İşlem başarılı"
        : String(result.errorMessage ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: ok ? request.refund_amount : undefined,
      private_response: result,
    };
  }

  override async binInstallmentQuery(
    request: BINInstallmentQueryRequest,
    auth: MerchantAuth,
  ): Promise<BINInstallmentQueryResponse> {
    const body: Record<string, unknown> = {
      binNumber: request.BIN,
      amount: Number(formatAmount(request.amount ?? 0)),
    };
    body.securityHash = this.signature(auth, body);
    const result = await this.json(
      `${this.baseUrl(auth)}/installment/installment-info`,
      auth,
      body,
    );
    const installments = Array.isArray(result.installments)
      ? result.installments
      : [];
    const ok = result.isInstallment === true;
    const installment_list = ok
      ? installments.flatMap((value) => {
          const count = Number(value);
          return count > 1
            ? [
                {
                  installment: count,
                  rate: 0,
                  total_amount: request.amount ?? 0,
                },
              ]
            : [];
        })
      : [];
    return {
      confirm: installment_list.length > 0,
      installment_list,
      private_response: result,
    };
  }
}

export const createRealProviderGateway = (
  bank: BankDefinition,
): AbstractGateway | undefined => {
  if (bank.bank_code in ccpaymentConfig) return new CCPaymentGateway(bank);
  if (bank.bank_code in paytenConfig) return new PaytenGateway(bank);
  switch (bank.bank_code) {
    case BankCodes.PARAMPOS:
      return new ParamPosGateway(bank);
    case BankCodes.MOKA:
      return new MokaGateway(bank);
    case BankCodes.PAYNKOLAY:
      return new PaynkolayGateway(bank);
    case BankCodes.AHLPAY:
      return new AhlpayGateway(bank);
    case BankCodes.IYZICO:
      return new IyzicoGateway(bank);
    case BankCodes.TAMI:
      return new TamiGateway(bank);
    default:
      return undefined;
  }
};
