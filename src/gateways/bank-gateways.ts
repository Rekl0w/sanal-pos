import { BankCodes } from "../domain/banks";
import {
  CurrencyMap,
  ResponseStatus,
  SaleQueryResponseStatus,
  SaleResponseStatus,
} from "../domain/enums";
import type {
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
import { nestpayConfig } from "../config/gateway-config";
import { HttpClient } from "../infra/http-client";
import {
  clearNumber,
  currencyNumericString,
  currencyPaddedString,
  detectCardType,
  formatAmount,
  getFormParams,
  parseSemicolonResponse,
  randomHex,
  sha1Base64,
  sha1Hex,
  sha256Hex,
  sha512Base64,
  toKurus,
  ykbCurrencyCode,
} from "../infra/payment-utils";
import { buildXml, findNode, flattenXmlObject, parseXml } from "../infra/xml";
import { AbstractGateway } from "./abstract-gateway";

const liveFlag = (auth: MerchantAuth): boolean => !auth.test_platform;

const getSaleInfo = (request: SaleRequest) => request.sale_info!;
class NestpayGateway extends AbstractGateway {
  private readonly urls: {
    apiLive: string;
    threeDLive: string;
    apiTest?: string;
    threeDTest?: string;
  };

  constructor(bank: BankDefinition) {
    super(bank);
    this.urls = nestpayConfig[bank.bank_code as keyof typeof nestpayConfig];
  }

  private apiUrl(auth: MerchantAuth): string {
    return auth.test_platform
      ? (this.urls.apiTest ?? "https://entegrasyon.asseco-see.com.tr/fim/api")
      : this.urls.apiLive;
  }

  private threeDUrl(auth: MerchantAuth): string {
    return auth.test_platform
      ? (this.urls.threeDTest ??
          "https://entegrasyon.asseco-see.com.tr/fim/est3Dgate")
      : this.urls.threeDLive;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }

    const saleInfo = getSaleInfo(request);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "";
    const payload = {
      Name: auth.merchant_user,
      Password: auth.merchant_password,
      ClientId: auth.merchant_id,
      Type: "Auth",
      OrderId: request.order_number,
      Taksit: installment,
      Total: formatAmount(saleInfo.amount ?? 0),
      Currency: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
      Number: clearNumber(saleInfo.card_number),
      Expires: `${String(saleInfo.card_expiry_month).padStart(2, "0")}/${saleInfo.card_expiry_year}`,
      Cvv2Val: saleInfo.card_cvv,
    };

    const xml = buildXml("CC5Request", payload, "ISO-8859-9");
    const raw = await HttpClient.postForm(this.apiUrl(auth), { DATA: xml });
    const parsed = findNode(parseXml(raw), "CC5Response") ?? {};
    const response = flattenXmlObject(parsed);

    if (response.Response === "Approved") {
      return {
        status: SaleResponseStatus.Success,
        message: "İşlem başarıyla tamamlandı",
        order_number: request.order_number,
        transaction_id: response.TransId ?? "",
        private_response: parsed,
      };
    }

    return {
      status: SaleResponseStatus.Error,
      message: response.ErrMsg ?? "İşlem sırasında bir hata oluştu.",
      order_number: request.order_number,
      private_response: parsed,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "";
    const params: Record<string, string> = {
      pan: clearNumber(saleInfo.card_number),
      cv2: saleInfo.card_cvv ?? "",
      Ecom_Payment_Card_ExpDate_Year: String(saleInfo.card_expiry_year).slice(
        -2,
      ),
      Ecom_Payment_Card_ExpDate_Month: String(
        saleInfo.card_expiry_month,
      ).padStart(2, "0"),
      clientid: auth.merchant_id ?? "",
      amount: formatAmount(saleInfo.amount ?? 0),
      oid: request.order_number ?? "",
      okUrl: request.payment_3d?.return_url ?? "",
      failUrl: request.payment_3d?.return_url ?? "",
      rnd: String(Date.now()),
      storetype: "3d",
      lang: "tr",
      currency: currencyNumericString(saleInfo.currency ?? CurrencyMap.TRY),
      installment,
      taksit: installment,
      islemtipi: "Auth",
      hashAlgorithm: "ver3",
    };

    const sortedHash = Object.keys(params)
      .sort()
      .map((key) =>
        String(params[key]).replace(/\\/g, "\\\\").replace(/\|/g, "\\|"),
      )
      .join("|");

    params.hash = sha512Base64(`${sortedHash}|${auth.merchant_storekey ?? ""}`);

    const html = await HttpClient.postForm(this.threeDUrl(auth), params);
    const form = getFormParams(html);

    if (["Error", "Decline"].includes(form.Response ?? "")) {
      return {
        status: SaleResponseStatus.Error,
        message: form.ErrMsg ?? "İşlem sırasında bir hata oluştu.",
        order_number: request.order_number,
        private_response: form,
      };
    }

    return {
      status: SaleResponseStatus.RedirectHTML,
      message: html,
      order_number: request.order_number,
      private_response: form,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const responseArray = request.responseArray;
    const orderId = String(responseArray.oid ?? "");

    if (String(responseArray.mdStatus ?? "") !== "1") {
      return {
        status: SaleResponseStatus.Error,
        message: "3D doğrulaması başarısız.",
        order_number: orderId,
        private_response: { response_1: responseArray },
      };
    }

    const installment = String(responseArray.installment ?? "");
    const payload = {
      Name: auth.merchant_user,
      Password: auth.merchant_password,
      ClientId: auth.merchant_id,
      IPAddress: String(responseArray.clientIp ?? ""),
      OrderId: orderId,
      Taksit: installment,
      Type: "Auth",
      Number: String(responseArray.md ?? ""),
      PayerTxnId: String(responseArray.xid ?? ""),
      PayerSecurityLevel: String(responseArray.eci ?? ""),
      PayerAuthenticationCode: String(responseArray.cavv ?? ""),
    };

    const xml = buildXml("CC5Request", payload, "ISO-8859-9");
    const raw = await HttpClient.postForm(this.apiUrl(auth), { DATA: xml });
    const parsed = findNode(parseXml(raw), "CC5Response") ?? {};
    const flat = flattenXmlObject(parsed);

    if (flat.Response === "Approved") {
      return {
        status: SaleResponseStatus.Success,
        message: "İşlem başarıyla tamamlandı",
        order_number: orderId,
        transaction_id: flat.TransId ?? "",
        private_response: { response_1: responseArray, response_2: parsed },
      };
    }

    return {
      status: SaleResponseStatus.Error,
      message: flat.ErrMsg ?? "İşlem sırasında bir hata oluştu.",
      order_number: orderId,
      private_response: { response_1: responseArray, response_2: parsed },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const payload = {
      Name: auth.merchant_user,
      Password: auth.merchant_password,
      ClientId: auth.merchant_id,
      Type: "Void",
      TransId: request.transaction_id,
    };
    const xml = buildXml("CC5Request", payload, "ISO-8859-9");
    const raw = await HttpClient.postForm(this.apiUrl(auth), { DATA: xml });
    const parsed = findNode(parseXml(raw), "CC5Response") ?? {};
    const flat = flattenXmlObject(parsed);

    return {
      status:
        flat.Response === "Approved"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        flat.Response === "Approved"
          ? "İşlem başarıyla tamamlandı"
          : (flat.ErrMsg ?? "İşlem sırasında bir hata oluştu."),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: parsed,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const payload = {
      Name: auth.merchant_user,
      Password: auth.merchant_password,
      ClientId: auth.merchant_id,
      Type: "Credit",
      TransId: request.transaction_id,
      Total: formatAmount(request.refund_amount ?? 0),
    };
    const xml = buildXml("CC5Request", payload, "ISO-8859-9");
    const raw = await HttpClient.postForm(this.apiUrl(auth), { DATA: xml });
    const parsed = findNode(parseXml(raw), "CC5Response") ?? {};
    const flat = flattenXmlObject(parsed);

    return {
      status:
        flat.Response === "Approved"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        flat.Response === "Approved"
          ? "İşlem başarıyla tamamlandı"
          : (flat.ErrMsg ?? "İşlem sırasında bir hata oluştu."),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: request.refund_amount,
      private_response: parsed,
    };
  }

  override async saleQuery(
    request: SaleQueryRequest,
    auth: MerchantAuth,
  ): Promise<SaleQueryResponse> {
    const payload = {
      Name: auth.merchant_user,
      Password: auth.merchant_password,
      ClientId: auth.merchant_id,
      OrderId: request.order_number,
      Extra: {
        ORDERSTATUS: "QUERY",
      },
    };
    const xml = buildXml("CC5Request", payload, "ISO-8859-9");
    const raw = await HttpClient.postForm(this.apiUrl(auth), { DATA: xml });
    const parsedRoot = parseXml(raw);
    const parsed = findNode(parsedRoot, "CC5Response") ?? {};
    const flat = flattenXmlObject(parsed);

    if (flat.Response === "Approved") {
      return {
        status: SaleQueryResponseStatus.Found,
        message: "İşlem bulundu",
        order_number: request.order_number,
        transaction_id: flat.TransId ?? "",
        amount: flat.CAPTURE_AMT
          ? Number.parseFloat(String(flat.CAPTURE_AMT).replace(",", "."))
          : undefined,
        transaction_date: flat.CAPTURE_DTTM
          ? String(flat.CAPTURE_DTTM).split(".")[0]
          : undefined,
      };
    }

    return {
      status: SaleQueryResponseStatus.Error,
      message: flat.ErrMsg ?? "Sipariş bulunamadı",
      order_number: request.order_number,
    };
  }
}

class AkbankGateway extends AbstractGateway {
  private readonly apiTest =
    "https://apipre.akbank.com/api/v1/payment/virtualpos/transaction/process";
  private readonly apiLive =
    "https://api.akbank.com/api/v1/payment/virtualpos/transaction/process";
  private readonly threeDTest =
    "https://virtualpospaymentgatewaypre.akbank.com/securepay";
  private readonly threeDLive =
    "https://virtualpospaymentgateway.akbank.com/securepay";

  private authHash(body: string, storeKey: string): string {
    return sha512Base64(body + storeKey);
  }

  private async jsonRequest(
    payload: Record<string, unknown>,
    auth: MerchantAuth,
  ): Promise<Record<string, unknown>> {
    const body = JSON.stringify(payload);
    const raw = await HttpClient.postRaw(
      liveFlag(auth) ? this.apiLive : this.apiTest,
      body,
      {
        "Content-Type": "application/json; charset=utf-8",
        "auth-hash": this.authHash(body, auth.merchant_storekey ?? ""),
      },
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

    const saleInfo = getSaleInfo(request);
    const email = request.invoice_info?.email_address || "test@test.com";
    const payload = {
      version: "1.00",
      txnCode: "1000",
      requestDateTime: new Date().toISOString(),
      randomNumber: randomHex(128),
      terminal: {
        merchantSafeId: auth.merchant_user,
        terminalSafeId: auth.merchant_password,
      },
      order: { orderId: request.order_number },
      card: {
        cardHolderName: saleInfo.card_name_surname,
        cardNumber: clearNumber(saleInfo.card_number),
        cvv2: saleInfo.card_cvv,
        expireDate: `${String(saleInfo.card_expiry_month).padStart(2, "0")}${String(saleInfo.card_expiry_year).slice(-2)}`,
      },
      transaction: {
        amount: formatAmount(saleInfo.amount ?? 0),
        currencyCode: saleInfo.currency ?? CurrencyMap.TRY,
        motoInd: 0,
        installCount: saleInfo.installment ?? 1,
      },
      customer: {
        emailAddress: email,
        ipAddress: request.customer_ip_address,
      },
    };

    const result = await this.jsonRequest(payload, auth);
    const code = String(result.responseCode ?? "");
    const tx =
      (result.transaction as Record<string, unknown> | undefined) ?? {};

    return {
      status:
        code === "VPS-0000"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        code === "VPS-0000"
          ? "İşlem başarılı"
          : String(
              result.responseMessage ??
                (result.code === "401"
                  ? "Sanal pos üye işyeri bilgilerinizi kontrol ediniz"
                  : "İşlem sırasında bir hata oluştu"),
            ),
      order_number: request.order_number,
      transaction_id:
        code === "VPS-0000" ? String(tx.authCode ?? "") : undefined,
      private_response: result,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const amount = formatAmount(saleInfo.amount ?? 0);
    const email = request.invoice_info?.email_address || "test@test.com";
    const installCount = String(saleInfo.installment ?? 1);
    const params: Record<string, string> = {
      paymentModel: "3D",
      txnCode: "3000",
      merchantSafeId: auth.merchant_user ?? "",
      terminalSafeId: auth.merchant_password ?? "",
      orderId: request.order_number ?? "",
      lang: "TR",
      amount,
      currencyCode: String(saleInfo.currency ?? CurrencyMap.TRY),
      installCount,
      okUrl: request.payment_3d?.return_url ?? "",
      failUrl: request.payment_3d?.return_url ?? "",
      emailAddress: email,
      creditCard: clearNumber(saleInfo.card_number),
      expiredDate: `${String(saleInfo.card_expiry_month).padStart(2, "0")}${String(saleInfo.card_expiry_year).slice(-2)}`,
      cvv: saleInfo.card_cvv ?? "",
      randomNumber: randomHex(128),
      requestDateTime: new Date().toISOString(),
      hash: "",
    };
    const hashItems =
      (params.paymentModel ?? "") +
      (params.txnCode ?? "") +
      (params.merchantSafeId ?? "") +
      (params.terminalSafeId ?? "") +
      (params.orderId ?? "") +
      (params.lang ?? "") +
      (params.amount ?? "") +
      (params.currencyCode ?? "") +
      (params.installCount ?? "") +
      (params.okUrl ?? "") +
      (params.failUrl ?? "") +
      (params.emailAddress ?? "") +
      (params.creditCard ?? "") +
      (params.expiredDate ?? "") +
      (params.cvv ?? "") +
      (params.randomNumber ?? "") +
      (params.requestDateTime ?? "");
    params.hash = sha512Base64(hashItems + (auth.merchant_storekey ?? ""));

    const html = await HttpClient.postForm(
      liveFlag(auth) ? this.threeDLive : this.threeDTest,
      params,
    );
    const form = getFormParams(html);

    if (html.includes(`action="${params.failUrl}"`) && form.responseMessage) {
      return {
        status: SaleResponseStatus.Error,
        message: form.responseMessage,
        order_number: request.order_number,
        private_response: { stringResponse: html },
      };
    }

    return {
      status: SaleResponseStatus.RedirectHTML,
      message: html,
      order_number: request.order_number,
      private_response: { stringResponse: html },
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    if (
      String(ra.responseCode ?? "") !== "VPS-0000" ||
      String(ra.mdStatus ?? "") !== "1"
    ) {
      return {
        status: SaleResponseStatus.Error,
        message: String(ra.responseMessage ?? "3D doğrulaması başarısız"),
        order_number: String(ra.orderId ?? ""),
        private_response: { response_1: ra },
      };
    }

    const payload = {
      version: "1.00",
      txnCode: "1000",
      requestDateTime: new Date().toISOString(),
      randomNumber: randomHex(128),
      terminal: {
        merchantSafeId: auth.merchant_user,
        terminalSafeId: auth.merchant_password,
      },
      order: {
        orderId: String(ra.orderId ?? ""),
      },
      transaction: {
        amount: String(ra.amount ?? ""),
        currencyCode: request.currency ?? CurrencyMap.TRY,
        motoInd: 0,
        installCount: Number(ra.installCount ?? 1),
      },
      secureTransaction: {
        secureId: String(ra.secureId ?? ""),
        secureEcomInd: String(ra.secureEcomInd ?? ""),
        secureData: String(ra.secureData ?? ""),
        secureMd: String(ra.secureMd ?? ""),
      },
    };
    const result = await this.jsonRequest(payload, auth);
    const tx =
      (result.transaction as Record<string, unknown> | undefined) ?? {};
    const code = String(result.responseCode ?? "");

    return {
      status:
        code === "VPS-0000"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        code === "VPS-0000"
          ? "İşlem başarılı"
          : String(result.responseMessage ?? "İşlem sırasında bir hata oluştu"),
      order_number: String(ra.orderId ?? ""),
      transaction_id:
        code === "VPS-0000" ? String(tx.authCode ?? "") : undefined,
      private_response: { response_1: ra, response_2: result },
    };
  }
}

class GarantiGateway extends AbstractGateway {
  private readonly apiTest =
    "https://sanalposprovtest.garantibbva.com.tr/VPServlet";
  private readonly apiLive = "https://sanalposprov.garanti.com.tr/VPServlet";
  private readonly threeDTest =
    "https://sanalposprovtest.garantibbva.com.tr/servlet/gt3dengine";
  private readonly threeDLive =
    "https://sanalposprov.garanti.com.tr/servlet/gt3dengine";

  private hashedPassword(auth: MerchantAuth): string {
    return sha1Hex(
      (auth.merchant_password ?? "") +
        String(Number(auth.merchant_user ?? 0)).padStart(9, "0"),
    ).toUpperCase();
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = getSaleInfo(request);
    const amount = toKurus(saleInfo.amount ?? 0);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "";
    const hash = sha1Hex(
      (request.order_number ?? "") +
        (auth.merchant_user ?? "") +
        clearNumber(saleInfo.card_number) +
        amount +
        this.hashedPassword(auth),
    ).toUpperCase();
    const xml = buildXml(
      "GVPSRequest",
      {
        Mode: auth.test_platform ? "TEST" : "PROD",
        Version: "v0.00",
        Terminal: {
          ProvUserID: "PROVAUT",
          HashData: hash,
          MerchantID: auth.merchant_id,
          UserID: "PROVAUT",
          ID: auth.merchant_user,
        },
        Customer: {
          IPAddress: request.customer_ip_address,
          EmailAddress: request.invoice_info?.email_address ?? "",
        },
        Card: {
          Number: clearNumber(saleInfo.card_number),
          ExpireDate: `${String(saleInfo.card_expiry_month).padStart(2, "0")}${String(saleInfo.card_expiry_year).slice(-2)}`,
          CVV2: saleInfo.card_cvv,
        },
        Order: {
          OrderID: request.order_number,
          GroupID: "",
        },
        Transaction: {
          Type: "sales",
          InstallmentCnt: installment,
          Amount: amount,
          CurrencyCode: String(saleInfo.currency ?? CurrencyMap.TRY),
          CardholderPresentCode: "0",
          MotoInd: "N",
        },
      },
      "utf-8",
    );
    const raw = await HttpClient.postRaw(
      liveFlag(auth) ? this.apiLive : this.apiTest,
      xml,
      {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    );
    const parsed = findNode(parseXml(raw), "GVPSResponse") ?? {};
    const tx =
      (parsed.Transaction as Record<string, unknown> | undefined) ?? {};
    const responseNode =
      (tx.Response as Record<string, unknown> | undefined) ?? {};
    const code = String(responseNode.Code ?? "");
    return {
      status:
        code === "00" ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message:
        code === "00"
          ? "İşlem başarılı"
          : String(responseNode.ErrorMsg ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id: code === "00" ? String(tx.RetrefNum ?? "") : undefined,
      private_response: parsed,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const amount = toKurus(saleInfo.amount ?? 0);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "";
    const hash = sha1Hex(
      (auth.merchant_user ?? "") +
        (request.order_number ?? "") +
        amount +
        (request.payment_3d?.return_url ?? "") +
        (request.payment_3d?.return_url ?? "") +
        "sales" +
        installment +
        (auth.merchant_storekey ?? "") +
        this.hashedPassword(auth),
    ).toUpperCase();
    const params = {
      mode: auth.test_platform ? "TEST" : "PROD",
      apiversion: "v0.01",
      version: "v0.01",
      secure3dsecuritylevel: "3D",
      terminalprovuserid: "PROVAUT",
      terminaluserid: "PROVAUT",
      terminalmerchantid: auth.merchant_id ?? "",
      terminalid: auth.merchant_user ?? "",
      txntype: "sales",
      txnamount: amount,
      txncurrencycode: String(saleInfo.currency ?? CurrencyMap.TRY),
      txninstallmentcount: installment,
      customeripaddress: request.customer_ip_address ?? "",
      customeremailaddress: request.invoice_info?.email_address ?? "",
      orderid: request.order_number ?? "",
      cardnumber: clearNumber(saleInfo.card_number),
      cardexpiredatemonth: String(saleInfo.card_expiry_month).padStart(2, "0"),
      cardexpiredateyear: String(saleInfo.card_expiry_year).slice(-2),
      cardcvv2: saleInfo.card_cvv ?? "",
      successurl: request.payment_3d?.return_url ?? "",
      errorurl: request.payment_3d?.return_url ?? "",
      secure3dhash: hash,
    };
    const raw = await HttpClient.postForm(
      liveFlag(auth) ? this.threeDLive : this.threeDTest,
      params,
    );
    const clean = raw.replace(/ value ="/g, ' value="');
    const form = getFormParams(clean);

    if (String(form.response ?? "").toLowerCase() === "error") {
      return {
        status: SaleResponseStatus.Error,
        message: form.errmsg ?? "İşlem sırasında hata oluştu.",
        order_number: request.order_number,
        private_response: form,
      };
    }

    if (raw.includes(`action="${request.payment_3d?.return_url ?? ""}"`)) {
      return this.sale3DResponse(
        { responseArray: form, currency: saleInfo.currency },
        auth,
      );
    }

    return {
      status:
        (form.TermUrl && form.MD && form.PaReq) || raw.includes("<form ")
          ? SaleResponseStatus.RedirectHTML
          : SaleResponseStatus.Error,
      message:
        (form.TermUrl && form.MD && form.PaReq) || raw.includes("<form ")
          ? raw
          : "İşlem sırasında hata oluştu. Lütfen daha sonra tekrar deneyiniz.",
      order_number: request.order_number,
      private_response: form,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    const mdStatus = String(ra.mdstatus ?? "");
    if (mdStatus !== "1") {
      const messages: Record<string, string> = {
        "0": "3-D doğrulama başarısız",
        "2": "Kart sahibi veya bankası sisteme kayıtlı değil",
        "3": "Kartın bankası sisteme kayıtlı değil",
        "4": "Doğrulama denemesi, kart sahibi sisteme daha sonra kayıt olmayı seçmiş",
        "5": "Doğrulama yapılamıyor",
        "6": "3-D Secure hatası",
        "7": "Sistem hatası",
        "8": "Bilinmeyen kart no",
        "9": "Üye İşyeri 3D-Secure sistemine kayıtlı değil",
      };
      return {
        status: SaleResponseStatus.Error,
        message: messages[mdStatus] ?? "3-D Secure doğrulanamadı",
        order_number: String(ra.oid ?? ""),
        private_response: ra,
      };
    }

    const amount = String(ra.txnamount ?? "");
    const hash = sha1Hex(
      String(ra.oid ?? "") +
        (auth.merchant_user ?? "") +
        amount +
        this.hashedPassword(auth),
    ).toUpperCase();
    const xml = buildXml(
      "GVPSRequest",
      {
        Mode: auth.test_platform ? "TEST" : "PROD",
        Version: "v0.00",
        Terminal: {
          ProvUserID: "PROVAUT",
          HashData: hash,
          MerchantID: auth.merchant_id,
          UserID: "PROVAUT",
          ID: auth.merchant_user,
        },
        Customer: {
          IPAddress: ra.customeripaddress ?? "",
          EmailAddress: ra.customeremailaddress ?? "",
        },
        Card: { Number: "", ExpireDate: "", CVV2: "" },
        Order: { OrderID: ra.oid ?? "", GroupID: "", Description: "" },
        Transaction: {
          Type: "sales",
          InstallmentCnt: String(ra.txninstallmentcount ?? ""),
          Amount: amount,
          CurrencyCode: String(ra.txncurrencycode ?? ""),
          CardholderPresentCode: "13",
          MotoInd: "N",
          Secure3D: {
            AuthenticationCode: ra.cavv ?? "",
            SecurityLevel: ra.eci ?? "",
            TxnID: ra.xid ?? "",
            Md: ra.md ?? "",
          },
        },
      },
      "utf-8",
    );
    const raw = await HttpClient.postRaw(
      liveFlag(auth) ? this.apiLive : this.apiTest,
      xml,
      {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    );
    const parsed = findNode(parseXml(raw), "GVPSResponse") ?? {};
    const tx =
      (parsed.Transaction as Record<string, unknown> | undefined) ?? {};
    const responseNode =
      (tx.Response as Record<string, unknown> | undefined) ?? {};
    const code = String(responseNode.Code ?? "");

    return {
      status:
        code === "00" ? SaleResponseStatus.Success : SaleResponseStatus.Error,
      message:
        code === "00"
          ? "İşlem başarılı"
          : String(responseNode.ErrorMsg ?? "İşlem sırasında bir hata oluştu"),
      order_number: String(ra.oid ?? ""),
      transaction_id: code === "00" ? String(tx.RetrefNum ?? "") : undefined,
      private_response: parsed,
    };
  }
}

class InterVposGateway extends AbstractGateway {
  constructor(
    bank: BankDefinition,
    private readonly urls: { test: string; live: string },
    private readonly fields: {
      merchantIdKey: string;
      merchantIdStatic?: string;
      userCodeKey: string;
      userPassKey: string;
      merchantIdUsesAuthUser?: boolean;
      errorMessageKey: string;
      orderIdKey: string;
      orgOrderIdKey: string;
    },
  ) {
    super(bank);
  }

  private url(auth: MerchantAuth): string {
    return auth.test_platform ? this.urls.test : this.urls.live;
  }

  private credentials(auth: MerchantAuth): Record<string, string> {
    const result: Record<string, string> = {
      [this.fields.userCodeKey]: auth.merchant_user ?? "",
      [this.fields.userPassKey]: auth.merchant_password ?? "",
    };
    result[this.fields.merchantIdKey] =
      this.fields.merchantIdStatic ??
      (this.fields.merchantIdUsesAuthUser
        ? (auth.merchant_user ?? "")
        : (auth.merchant_id ?? ""));
    return result;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = getSaleInfo(request);
    const payload = {
      ...this.credentials(auth),
      PurchAmount: formatAmount(saleInfo.amount ?? 0),
      Currency: String(saleInfo.currency ?? CurrencyMap.TRY),
      [this.fields.orderIdKey]: request.order_number ?? "",
      TxnType: "Auth",
      InstallmentCount:
        (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "0",
      SecureType: "NonSecure",
      Pan: clearNumber(saleInfo.card_number),
      Cvv2: saleInfo.card_cvv ?? "",
      Expiry: `${String(saleInfo.card_expiry_month).padStart(2, "0")}${String(saleInfo.card_expiry_year).slice(-2)}`,
      Lang: "TR",
    };
    const raw = await HttpClient.postForm(this.url(auth), payload);
    const parsed = parseSemicolonResponse(raw);
    return {
      status:
        parsed.ProcReturnCode === "00"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        parsed.ProcReturnCode === "00"
          ? this.bank.bank_code === BankCodes.DENIZBANK
            ? "İşlem başarıyla tamamlandı"
            : "İşlem başarılı"
          : (parsed[this.fields.errorMessageKey] ??
            "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id: parsed.TransId ?? parsed.AuthCode,
      private_response: parsed,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const rnd = randomHex(16);
    const installment =
      (saleInfo.installment ?? 1) > 1 ? String(saleInfo.installment) : "0";
    const basePayload = {
      ...this.credentials(auth),
      PurchAmount: formatAmount(saleInfo.amount ?? 0),
      Currency: String(saleInfo.currency ?? CurrencyMap.TRY),
      [this.fields.orderIdKey]: request.order_number ?? "",
      OkUrl: request.payment_3d?.return_url ?? "",
      FailUrl: request.payment_3d?.return_url ?? "",
      Rnd: rnd,
      TxnType: "Auth",
      InstallmentCount: installment,
      SecureType: "3DPay",
      Pan: clearNumber(saleInfo.card_number),
      Cvv2: saleInfo.card_cvv ?? "",
      Expiry: `${String(saleInfo.card_expiry_month).padStart(2, "0")}${String(saleInfo.card_expiry_year).slice(-2)}`,
    };
    const merchantPrefix =
      this.fields.merchantIdStatic ??
      (this.fields.merchantIdUsesAuthUser
        ? (auth.merchant_user ?? "")
        : (auth.merchant_id ?? ""));
    const hash = sha1Base64(
      merchantPrefix +
        (request.order_number ?? "") +
        formatAmount(saleInfo.amount ?? 0) +
        (request.payment_3d?.return_url ?? "") +
        (request.payment_3d?.return_url ?? "") +
        "Auth" +
        installment +
        rnd +
        (auth.merchant_storekey ?? ""),
    );
    const raw = await HttpClient.postForm(this.url(auth), {
      ...basePayload,
      Hash: hash,
    });
    const form = getFormParams(raw);
    const error = form[this.fields.errorMessageKey] ?? form.ErrMsg;

    return {
      status: error
        ? SaleResponseStatus.Error
        : SaleResponseStatus.RedirectHTML,
      message: error
        ? `${form.ErrorCode ?? ""}${error ? ` - ${error}` : ""}`.trim()
        : raw,
      order_number: request.order_number,
      private_response: form,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    return {
      status:
        String(ra.ProcReturnCode ?? "") === "00"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        String(ra.ProcReturnCode ?? "") === "00"
          ? "İşlem başarılı"
          : String(
              ra[this.fields.errorMessageKey] ??
                "İşlem sırasında bir hata oluştu",
            ),
      order_number: String(ra[this.fields.orderIdKey] ?? ""),
      transaction_id: String(ra.TransId ?? ra.AuthCode ?? ""),
      private_response: ra,
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const payload = {
      ...this.credentials(auth),
      [this.fields.orgOrderIdKey]: request.order_number ?? "",
      TxnType: "Void",
      SecureType: "NonSecure",
      Lang: "TR",
    };
    const raw = await HttpClient.postForm(this.url(auth), payload);
    const parsed = parseSemicolonResponse(raw);
    return {
      status:
        parsed.ProcReturnCode === "00"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        parsed.ProcReturnCode === "00"
          ? "İşlem başarılı"
          : (parsed[this.fields.errorMessageKey] ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: parsed,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const payload = {
      ...this.credentials(auth),
      PurchAmount: formatAmount(request.refund_amount ?? 0),
      Currency: String(request.currency ?? CurrencyMap.TRY),
      [this.fields.orgOrderIdKey]: request.order_number ?? "",
      TxnType: "Refund",
      SecureType: "NonSecure",
      Lang: "TR",
    };
    const raw = await HttpClient.postForm(this.url(auth), payload);
    const parsed = parseSemicolonResponse(raw);
    return {
      status:
        parsed.ProcReturnCode === "00"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        parsed.ProcReturnCode === "00"
          ? "İşlem başarılı"
          : (parsed[this.fields.errorMessageKey] ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: request.refund_amount,
      private_response: parsed,
    };
  }
}

class VakifbankGateway extends AbstractGateway {
  private readonly apiTest =
    "https://onlineodemetest.vakifbank.com.tr:4443/VposService/v3/Vposreq.aspx";
  private readonly apiLive =
    "https://onlineodeme.vakifbank.com.tr:4443/VposService/v3/Vposreq.aspx";
  private readonly threeDTest =
    "https://3dsecuretest.vakifbank.com.tr:4443/MPIAPI/MPI_Enrollment.aspx";
  private readonly threeDLive =
    "https://3dsecure.vakifbank.com.tr:4443/MPIAPI/MPI_Enrollment.aspx";

  private apiUrl(auth: MerchantAuth): string {
    return auth.test_platform ? this.apiTest : this.apiLive;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = getSaleInfo(request);
    const xml = buildXml("VposRequest", {
      MerchantId: auth.merchant_id,
      Password: auth.merchant_password,
      TerminalNo: auth.merchant_user,
      TransactionType: "Sale",
      TransactionId: "",
      CurrencyAmount: formatAmount(saleInfo.amount ?? 0),
      CurrencyCode: String(saleInfo.currency ?? CurrencyMap.TRY),
      Pan: clearNumber(saleInfo.card_number),
      Cvv: saleInfo.card_cvv,
      Expiry: `${saleInfo.card_expiry_year}${String(saleInfo.card_expiry_month).padStart(2, "0")}`,
      OrderId: request.order_number,
      ClientIp: request.customer_ip_address,
      TransactionDeviceSource: "0",
      ...(saleInfo.installment && saleInfo.installment > 1
        ? { NumberOfInstallments: String(saleInfo.installment) }
        : {}),
    });
    const raw = await HttpClient.postForm(this.apiUrl(auth), { prmstr: xml });
    const parsed = findNode(parseXml(raw), "VposResponse") ?? {};
    const flat = flattenXmlObject(parsed);
    return {
      status:
        flat.ResultCode === "0000"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        flat.ResultCode === "0000"
          ? "İşlem başarılı"
          : (flat.ResultDetail ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id:
        flat.ResultCode === "0000" ? (flat.TransactionId ?? "") : undefined,
      private_response: parsed,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const req = {
      MerchantId: auth.merchant_id,
      MerchantPassword: auth.merchant_password,
      VerifyEnrollmentRequestId: randomHex(16),
      Pan: clearNumber(saleInfo.card_number),
      ExpiryDate: `${String(saleInfo.card_expiry_year).slice(-2)}${String(saleInfo.card_expiry_month).padStart(2, "0")}`,
      PurchaseAmount: formatAmount(saleInfo.amount ?? 0),
      Currency: String(saleInfo.currency ?? CurrencyMap.TRY),
      SuccessUrl: request.payment_3d?.return_url ?? "",
      FailureUrl: request.payment_3d?.return_url ?? "",
      SessionInfo: request.order_number ?? "",
      ...((saleInfo.installment ?? 1) > 1
        ? { InstallmentCount: String(saleInfo.installment) }
        : {}),
    };
    const raw = await HttpClient.postForm(
      auth.test_platform ? this.threeDTest : this.threeDLive,
      req,
    );
    const parsed = parseXml(raw);
    const verRes = findNode(parsed, "VERes") ?? {};
    const status = String(verRes.Status ?? "");
    if (status !== "Y") {
      return {
        status: SaleResponseStatus.Error,
        message: "Bu kart 3D Secure ile kullanılamaz",
        order_number: request.order_number,
        private_response: parsed,
      };
    }
    const html = `<html><body onload="document.frm.submit();"><form name="frm" method="POST" action="${String(verRes.ACSUrl ?? "")}"><input type="hidden" name="PaReq" value="${String(verRes.PaReq ?? "")}"><input type="hidden" name="TermUrl" value="${request.payment_3d?.return_url ?? ""}"><input type="hidden" name="MD" value="${req.VerifyEnrollmentRequestId}"></form></body></html>`;
    return {
      status: SaleResponseStatus.RedirectHTML,
      message: html,
      order_number: request.order_number,
      private_response: parsed,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const ra = request.responseArray;
    if (String(ra.Status ?? "") !== "Y") {
      return {
        status: SaleResponseStatus.Error,
        message: "3D doğrulaması başarısız",
        order_number: String(ra.SessionInfo ?? ra.order_number ?? ""),
        private_response: { response_1: ra },
      };
    }

    const orderId = String(ra.SessionInfo ?? ra.order_number ?? "");
    const amount = formatAmount(Number(String(ra.PurchAmount ?? "0")) / 100);
    const xml = buildXml("VposRequest", {
      MerchantId: auth.merchant_id,
      Password: auth.merchant_password,
      TerminalNo: auth.merchant_user,
      TransactionType: "Sale",
      TransactionId: "",
      CurrencyAmount: amount,
      CurrencyCode: String(request.currency ?? CurrencyMap.TRY),
      Pan: String(ra.Pan ?? ""),
      Cvv: "",
      Expiry:
        String(ra.Expiry ?? "").length === 4
          ? `20${String(ra.Expiry ?? "")}`
          : String(ra.Expiry ?? ""),
      OrderId: orderId,
      ECI: String(ra.Eci ?? ""),
      CAVV: String(ra.Cavv ?? ""),
      MpiTransactionId: String(ra.VerifyEnrollmentRequestId ?? ""),
      ClientIp: "1.1.1.1",
      TransactionDeviceSource: "0",
      ...(ra.InstallmentCount && String(ra.InstallmentCount) !== "0"
        ? { NumberOfInstallments: String(ra.InstallmentCount) }
        : {}),
    });
    const raw = await HttpClient.postForm(this.apiUrl(auth), { prmstr: xml });
    const parsed = findNode(parseXml(raw), "VposResponse") ?? {};
    const flat = flattenXmlObject(parsed);
    return {
      status:
        flat.ResultCode === "0000"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        flat.ResultCode === "0000"
          ? "İşlem başarılı"
          : (flat.ResultDetail ?? "İşlem sırasında bir hata oluştu"),
      order_number: orderId,
      transaction_id:
        flat.ResultCode === "0000" ? (flat.TransactionId ?? "") : undefined,
      private_response: { response_1: ra, response_2: parsed },
    };
  }

  override async cancel(
    request: CancelRequest,
    auth: MerchantAuth,
  ): Promise<CancelResponse> {
    const xml = buildXml("VposRequest", {
      MerchantId: auth.merchant_id,
      Password: auth.merchant_password,
      TerminalNo: auth.merchant_user,
      TransactionType: "Cancel",
      ReferenceTransactionId: request.transaction_id,
      ClientIp: request.customer_ip_address,
    });
    const raw = await HttpClient.postForm(this.apiUrl(auth), { prmstr: xml });
    const parsed = findNode(parseXml(raw), "VposResponse") ?? {};
    const flat = flattenXmlObject(parsed);
    return {
      status:
        flat.ResultCode === "0000"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        flat.ResultCode === "0000"
          ? "İşlem başarılı"
          : (flat.ResultDetail ?? "İşlem iptal edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      private_response: parsed,
    };
  }

  override async refund(
    request: RefundRequest,
    auth: MerchantAuth,
  ): Promise<RefundResponse> {
    const xml = buildXml("VposRequest", {
      MerchantId: auth.merchant_id,
      Password: auth.merchant_password,
      TerminalNo: auth.merchant_user,
      TransactionType: "Refund",
      ReferenceTransactionId: request.transaction_id,
      CurrencyAmount: formatAmount(request.refund_amount ?? 0),
      ClientIp: request.customer_ip_address,
    });
    const raw = await HttpClient.postForm(this.apiUrl(auth), { prmstr: xml });
    const parsed = findNode(parseXml(raw), "VposResponse") ?? {};
    const flat = flattenXmlObject(parsed);
    return {
      status:
        flat.ResultCode === "0000"
          ? ResponseStatus.Success
          : ResponseStatus.Error,
      message:
        flat.ResultCode === "0000"
          ? "İşlem başarılı"
          : (flat.ResultDetail ?? "İşlem iade edilemedi"),
      order_number: request.order_number,
      transaction_id: request.transaction_id,
      refund_amount: request.refund_amount,
      private_response: parsed,
    };
  }
}

class YapiKrediGateway extends AbstractGateway {
  private readonly apiTest = "https://setmpos.ykb.com/PosnetWebService/XML";
  private readonly apiLive =
    "https://posnet.yapikredi.com.tr/PosnetWebService/XML";
  private readonly threeDTest =
    "https://setmpos.ykb.com/3DSWebService/YKBPaymentService";
  private readonly threeDLive =
    "https://posnet.yapikredi.com.tr/3DSWebService/YKBPaymentService";

  private url(auth: MerchantAuth): string {
    return auth.test_platform ? this.apiTest : this.apiLive;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = getSaleInfo(request);
    const xml = `<?xml version="1.0" encoding="utf-8"?><posnetRequest><mid>${auth.merchant_id}</mid><tid>${auth.merchant_user}</tid><tranDateRequired>1</tranDateRequired><sale><ccno>${clearNumber(saleInfo.card_number)}</ccno><cvc>${saleInfo.card_cvv}</cvc><expDate>${String(saleInfo.card_expiry_year).slice(-2)}${String(saleInfo.card_expiry_month).padStart(2, "0")}</expDate><currencyCode>${ykbCurrencyCode(saleInfo.currency ?? CurrencyMap.TRY)}</currencyCode><amount>${toKurus(saleInfo.amount ?? 0)}</amount><orderID>${String(request.order_number ?? "").padStart(24, "0")}</orderID><installment>${String((saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 0).padStart(2, "0")}</installment></sale></posnetRequest>`;
    const raw = await HttpClient.postForm(this.url(auth), { xmldata: xml });
    const parsed = findNode(parseXml(raw), "posnetResponse") ?? {};
    const flat = flattenXmlObject(parsed);
    return {
      status:
        flat.approved === "1"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        flat.approved === "1"
          ? "İşlem başarılı"
          : (flat.respText ?? "İşlem sırasında bir hata oluştu"),
      order_number: request.order_number,
      transaction_id:
        flat.approved === "1" ? (flat.hostlogkey ?? "") : undefined,
      private_response: parsed,
    };
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const xid = String(request.order_number ?? "").padStart(20, "0");
    const oosXml = `<?xml version="1.0" encoding="utf-8"?><posnetRequest><mid>${auth.merchant_id}</mid><tid>${auth.merchant_user}</tid><oosRequestData><posnetid>${auth.merchant_password}</posnetid><XID>${xid}</XID><tranType>Sale</tranType><cardHolderName>${saleInfo.card_name_surname}</cardHolderName><ccno>${clearNumber(saleInfo.card_number)}</ccno><cvc>${saleInfo.card_cvv}</cvc><expDate>${String(saleInfo.card_expiry_year).slice(-2)}${String(saleInfo.card_expiry_month).padStart(2, "0")}</expDate><currencyCode>${ykbCurrencyCode(saleInfo.currency ?? CurrencyMap.TRY)}</currencyCode><amount>${toKurus(saleInfo.amount ?? 0)}</amount><installment>${String((saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 0).padStart(2, "0")}</installment></oosRequestData></posnetRequest>`;
    const oosRaw = await HttpClient.postForm(this.url(auth), {
      xmldata: oosXml,
    });
    const oosParsed = findNode(parseXml(oosRaw), "posnetResponse") ?? {};
    const oosFlat = flattenXmlObject(oosParsed);
    if (oosFlat.approved !== "1") {
      return {
        status: SaleResponseStatus.Error,
        message: oosFlat.respText ?? "OOS veri oluşturulamadı",
        order_number: request.order_number,
        private_response: oosParsed,
      };
    }
    const responseNode = findNode(oosParsed, "oosRequestDataResponse") ?? {};
    const html = `<html><body onload="document.frm.submit();"><form name="frm" method="POST" action="${auth.test_platform ? this.threeDTest : this.threeDLive}"><input type="hidden" name="mid" value="${auth.merchant_id}"><input type="hidden" name="posnetID" value="${auth.merchant_password}"><input type="hidden" name="posnetData" value="${String(responseNode.data1 ?? "")}"><input type="hidden" name="posnetData2" value="${String(responseNode.data2 ?? "")}"><input type="hidden" name="digest" value="${String(responseNode.sign ?? "")}"><input type="hidden" name="merchantReturnURL" value="${request.payment_3d?.return_url ?? ""}"><input type="hidden" name="lang" value="tr"></form></body></html>`;
    return {
      status: SaleResponseStatus.RedirectHTML,
      message: html,
      order_number: request.order_number,
      private_response: oosParsed,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.currency === undefined) {
      throw new Error("currency alanı Yapı Kredi bankası için zorunludur");
    }
    const ra = request.responseArray;
    const bankPacket = String(ra.BankPacket ?? "");
    const merchantPacket = String(ra.MerchantPacket ?? "");
    const sign = String(ra.Sign ?? "");
    const xid = String(ra.Xid ?? "");
    const amount = String(ra.Amount ?? "");
    const currency = String(ra.Currency ?? "");
    const firstHash = Buffer.from(
      sha256Hex(
        (auth.merchant_storekey ?? "") + ";" + (auth.merchant_user ?? ""),
      ),
      "hex",
    ).toString("base64");
    const mac = Buffer.from(
      sha256Hex(
        `${xid};${amount};${currency};${auth.merchant_id};${firstHash}`,
      ),
      "hex",
    ).toString("base64");
    const resolveXml = `<?xml version="1.0" encoding="utf-8"?><posnetRequest><mid>${auth.merchant_id}</mid><tid>${auth.merchant_user}</tid><oosResolveMerchantData><bankData>${bankPacket}</bankData><merchantData>${merchantPacket}</merchantData><sign>${sign}</sign><mac>${mac}</mac></oosResolveMerchantData></posnetRequest>`;
    const resolveRaw = await HttpClient.postForm(this.url(auth), {
      xmldata: resolveXml,
    });
    const resolveParsed =
      findNode(parseXml(resolveRaw), "posnetResponse") ?? {};
    const resolveNode =
      findNode(resolveParsed, "oosResolveMerchantDataResponse") ?? {};
    const mdStatus = String(resolveNode.mdStatus ?? "");
    if (mdStatus !== "1" && !(auth.test_platform && mdStatus === "9")) {
      return {
        status: SaleResponseStatus.Error,
        message: `3D doğrulaması başarısız (mdStatus: ${mdStatus})`,
        order_number: xid,
        private_response: { response_resolve: resolveParsed },
      };
    }
    const tranXml = `<?xml version="1.0" encoding="utf-8"?><posnetRequest><mid>${auth.merchant_id}</mid><tid>${auth.merchant_user}</tid><oosTranData><bankData>${bankPacket}</bankData><wpAmount>0</wpAmount><mac>${mac}</mac></oosTranData></posnetRequest>`;
    const tranRaw = await HttpClient.postForm(this.url(auth), {
      xmldata: tranXml,
    });
    const tranParsed = findNode(parseXml(tranRaw), "posnetResponse") ?? {};
    const flat = flattenXmlObject(tranParsed);
    return {
      status:
        flat.approved === "1"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        flat.approved === "1"
          ? "İşlem başarılı"
          : (flat.respText ?? "İşlem sırasında bir hata oluştu"),
      order_number: xid,
      transaction_id:
        flat.approved === "1" ? (flat.hostlogkey ?? "") : undefined,
      private_response: {
        response_resolve: resolveParsed,
        response_tran: tranParsed,
      },
    };
  }
}

class KatilimGateway extends AbstractGateway {
  constructor(
    bank: BankDefinition,
    private readonly urls: {
      non3DTest?: string;
      non3DLive: string;
      threeDTest?: string;
      threeDLive: string;
      threeDProvisionTest?: string;
      threeDProvisionLive: string;
      rootTag: string;
      apiVersion: string;
      includeHashPassword?: boolean;
      requestResponseKey: string;
      responseWrapperKey?: string;
      usePaymentType?: boolean;
      liveOnly?: boolean;
    },
  ) {
    super(bank);
  }

  private pickUrl(
    auth: MerchantAuth,
    type: "non3d" | "3d" | "provision",
  ): string {
    if (type === "non3d") {
      return auth.test_platform && this.urls.non3DTest
        ? this.urls.non3DTest
        : this.urls.non3DLive;
    }
    if (type === "3d") {
      return auth.test_platform && this.urls.threeDTest
        ? this.urls.threeDTest
        : this.urls.threeDLive;
    }
    return auth.test_platform && this.urls.threeDProvisionTest
      ? this.urls.threeDProvisionTest
      : this.urls.threeDProvisionLive;
  }

  private buildBody(
    request: SaleRequest,
    auth: MerchantAuth,
    hash: string,
    security: number,
  ): string {
    const saleInfo = getSaleInfo(request);
    const amount = toKurus(saleInfo.amount ?? 0);
    const currencyCode = currencyPaddedString(
      saleInfo.currency ?? CurrencyMap.TRY,
    );
    const installment =
      (saleInfo.installment ?? 1) > 1 ? saleInfo.installment : 0;
    const expMonth = String(saleInfo.card_expiry_month).padStart(2, "0");
    const expYear = String(saleInfo.card_expiry_year).slice(-2);
    const cardType = detectCardType(saleInfo.card_number ?? "");
    const additional = this.urls.usePaymentType
      ? "<PaymentType>1</PaymentType>"
      : "";
    const hashPassword = this.urls.includeHashPassword
      ? `<HashPassword>${sha1Base64(auth.merchant_password ?? "")}</HashPassword>`
      : "";
    const ok = request.payment_3d?.return_url ?? "";
    const fail = request.payment_3d?.return_url ?? "";
    const customerIp = request.customer_ip_address ?? "";

    return `<?xml version="1.0" encoding="utf-8"?><${this.urls.rootTag}><APIVersion>${this.urls.apiVersion}</APIVersion><HashData>${hash}</HashData>${hashPassword}<MerchantId>${auth.merchant_id}</MerchantId><CustomerId>${auth.merchant_storekey}</CustomerId><UserName>${auth.merchant_user}</UserName><TransactionType>Sale</TransactionType><InstallmentCount>${installment}</InstallmentCount><Amount>${amount}</Amount><DisplayAmount>${amount}</DisplayAmount><CurrencyCode>${currencyCode}</CurrencyCode>${this.urls.usePaymentType ? `<FECCurrencyCode>${currencyCode}</FECCurrencyCode>` : ""}<MerchantOrderId>${request.order_number}</MerchantOrderId><TransactionSecurity>${security}</TransactionSecurity>${additional}<OkUrl>${ok}</OkUrl><FailUrl>${fail}</FailUrl><CardNumber>${clearNumber(saleInfo.card_number)}</CardNumber><CardCVV2>${saleInfo.card_cvv}</CardCVV2><CardHolderName>${saleInfo.card_name_surname}</CardHolderName><CardType>${cardType}</CardType><CardExpireDateYear>${expYear}</CardExpireDateYear><CardExpireDateMonth>${expMonth}</CardExpireDateMonth>${this.urls.usePaymentType ? `<CustomerIPAddress>${customerIp}</CustomerIPAddress>` : ""}</${this.urls.rootTag}>`;
  }

  override async sale(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    if (request.payment_3d?.confirm) {
      return this.sale3D(request, auth);
    }
    const saleInfo = getSaleInfo(request);
    const amount = toKurus(saleInfo.amount ?? 0);
    const hash = sha1Base64(
      (auth.merchant_id ?? "") +
        (request.order_number ?? "") +
        amount +
        (auth.merchant_user ?? "") +
        sha1Base64(auth.merchant_password ?? ""),
    );
    const xml = this.buildBody(request, auth, hash, 1);
    const raw = await HttpClient.postRaw(this.pickUrl(auth, "non3d"), xml, {
      "Content-Type": "application/xml; charset=utf-8",
    });
    return this.parseKatilimSaleResponse(raw, request.order_number);
  }

  private async sale3D(
    request: SaleRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const saleInfo = getSaleInfo(request);
    const amount = toKurus(saleInfo.amount ?? 0);
    const hash = sha1Base64(
      (auth.merchant_id ?? "") +
        (request.order_number ?? "") +
        amount +
        (request.payment_3d?.return_url ?? "") +
        (request.payment_3d?.return_url ?? "") +
        (auth.merchant_user ?? "") +
        sha1Base64(auth.merchant_password ?? ""),
    );
    const xml = this.buildBody(request, auth, hash, 3);
    const raw = await HttpClient.postRaw(this.pickUrl(auth, "3d"), xml, {
      "Content-Type": "application/xml; charset=utf-8",
    });
    if (raw.includes("form") && raw.includes("action")) {
      return {
        status: SaleResponseStatus.RedirectHTML,
        message: raw,
        order_number: request.order_number,
        private_response: { htmlResponse: raw },
      };
    }
    const parsed = flattenXmlObject(
      findNode(parseXml(raw), this.urls.requestResponseKey) ?? parseXml(raw),
    );
    return {
      status: SaleResponseStatus.Error,
      message: parsed.ResponseMessage ?? "İşlem sırasında bir hata oluştu",
      order_number: request.order_number,
      private_response: parsed,
    };
  }

  private parseKatilimSaleResponse(
    raw: string | undefined,
    orderNumber?: string,
  ): SaleResponse {
    const parsedNode =
      findNode(parseXml(raw ?? ""), this.urls.requestResponseKey) ??
      parseXml(raw ?? "");
    const flat = flattenXmlObject(parsedNode);
    return {
      status:
        flat.ResponseCode === "00"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        flat.ResponseCode === "00"
          ? "İşlem başarılı"
          : (flat.ResponseMessage ?? "İşlem sırasında bir hata oluştu"),
      order_number: orderNumber,
      transaction_id:
        flat.ResponseCode === "00"
          ? `${flat.ProvisionNumber ?? ""}|${flat.OrderId ?? ""}`
          : undefined,
      private_response: parsedNode,
    };
  }

  override async sale3DResponse(
    request: Sale3DResponseRequest,
    auth: MerchantAuth,
  ): Promise<SaleResponse> {
    const responseField =
      this.bank.bank_code === BankCodes.KUVEYT_TURK
        ? "AuthenticationResponse"
        : "ResponseMessage";
    const encoded = String(request.responseArray[responseField] ?? "");
    const parsed =
      findNode(
        parseXml(decodeURIComponent(encoded)),
        this.urls.requestResponseKey,
      ) ?? parseXml(decodeURIComponent(encoded));
    const flat = flattenXmlObject(parsed);
    if (flat.ResponseCode !== "00") {
      return {
        status: SaleResponseStatus.Error,
        message: flat.ResponseMessage ?? "3D doğrulaması başarısız",
        order_number: flat.MerchantOrderId ?? "",
        private_response: { response_parsed: parsed },
      };
    }
    const orderId = flat.MerchantOrderId ?? "";
    const amount = flat.Amount ?? "";
    const installment = flat.InstallmentCount ?? "0";
    const currencyCode = flat.CurrencyCode ?? "0949";
    const md = flat.MD ?? "";
    const hash = sha1Base64(
      (auth.merchant_id ?? "") +
        orderId +
        amount +
        (auth.merchant_user ?? "") +
        sha1Base64(auth.merchant_password ?? ""),
    );
    const extraMd =
      this.bank.bank_code === BankCodes.KUVEYT_TURK
        ? `<KuveytTurkVPosAdditionalData><AdditionalData><Key>MD</Key><Data>${md}</Data></AdditionalData></KuveytTurkVPosAdditionalData>`
        : `<AdditionalData><AdditionalDataList><VPosAdditionalData><Key>MD</Key><Data>${md}</Data></VPosAdditionalData></AdditionalDataList></AdditionalData>`;
    const xml = `<?xml version="1.0" encoding="utf-8"?><${this.urls.rootTag}><APIVersion>${this.bank.bank_code === BankCodes.KUVEYT_TURK ? "TDV2.0.0" : ""}</APIVersion><HashData>${hash}</HashData><MerchantId>${auth.merchant_id}</MerchantId><CustomerId>${auth.merchant_storekey}</CustomerId><UserName>${auth.merchant_user}</UserName><TransactionType>Sale</TransactionType><InstallmentCount>${installment}</InstallmentCount><Amount>${amount}</Amount><DisplayAmount>${amount}</DisplayAmount><CurrencyCode>${currencyCode}</CurrencyCode>${this.urls.usePaymentType ? `<FECCurrencyCode>${currencyCode}</FECCurrencyCode><PaymentType>1</PaymentType>` : ""}<MerchantOrderId>${orderId}</MerchantOrderId><TransactionSecurity>3</TransactionSecurity>${extraMd}</${this.urls.rootTag}>`;
    const raw = await HttpClient.postRaw(this.pickUrl(auth, "provision"), xml, {
      "Content-Type": "application/xml; charset=utf-8",
    });
    const prov =
      findNode(parseXml(raw), this.urls.requestResponseKey) ?? parseXml(raw);
    const provFlat = flattenXmlObject(prov);
    return {
      status:
        provFlat.ResponseCode === "00"
          ? SaleResponseStatus.Success
          : SaleResponseStatus.Error,
      message:
        provFlat.ResponseCode === "00"
          ? "İşlem başarılı"
          : (provFlat.ResponseMessage ?? "İşlem sırasında bir hata oluştu"),
      order_number: orderId,
      transaction_id:
        provFlat.ResponseCode === "00"
          ? `${provFlat.ProvisionNumber ?? ""}|${provFlat.OrderId ?? ""}`
          : undefined,
      private_response: { response_parsed: parsed, response_provision: prov },
    };
  }
}

export const createRealBankGateway = (
  bank: BankDefinition,
): AbstractGateway | undefined => {
  if (bank.bank_code in nestpayConfig) {
    return new NestpayGateway(bank);
  }

  switch (bank.bank_code) {
    case BankCodes.AKBANK:
      return new AkbankGateway(bank);
    case BankCodes.GARANTI_BBVA:
      return new GarantiGateway(bank);
    case BankCodes.DENIZBANK:
      return new InterVposGateway(
        bank,
        {
          test: "https://test.inter-vpos.com.tr/mpi/Default.aspx",
          live: "https://inter-vpos.com.tr/mpi/Default.aspx",
        },
        {
          merchantIdKey: "ShopCode",
          userCodeKey: "UserCode",
          userPassKey: "UserPass",
          errorMessageKey: "ErrorMessage",
          orderIdKey: "OrderId",
          orgOrderIdKey: "orgOrderId",
        },
      );
    case BankCodes.QNB_FINANSBANK:
      return new InterVposGateway(
        bank,
        {
          test: "https://vpostest.qnbfinansbank.com/Gateway/Default.aspx",
          live: "https://vpos.qnbfinansbank.com/Gateway/Default.aspx",
        },
        {
          merchantIdKey: "MerchantId",
          merchantIdStatic: "5",
          userCodeKey: "UserCode",
          userPassKey: "UserPass",
          errorMessageKey: "ErrMsg",
          orderIdKey: "OrderId",
          orgOrderIdKey: "OrgOrderId",
        },
      );
    case BankCodes.VAKIFBANK:
      return new VakifbankGateway(bank);
    case BankCodes.YAPI_KREDI:
      return new YapiKrediGateway(bank);
    case BankCodes.KUVEYT_TURK:
      return new KatilimGateway(bank, {
        non3DTest:
          "https://boatest.kuveytturk.com.tr/boa.virtualpos.services/Home/Non3DPayGate",
        non3DLive:
          "https://sanalpos.kuveytturk.com.tr/ServiceGateWay/Home/Non3DPayGate",
        threeDTest:
          "https://boatest.kuveytturk.com.tr/boa.virtualpos.services/Home/ThreeDModelPayGate",
        threeDLive:
          "https://sanalpos.kuveytturk.com.tr/ServiceGateWay/Home/ThreeDModelPayGate",
        threeDProvisionTest:
          "https://boatest.kuveytturk.com.tr/boa.virtualpos.services/Home/ThreeDModelProvisionGate",
        threeDProvisionLive:
          "https://sanalpos.kuveytturk.com.tr/ServiceGateWay/Home/ThreeDModelProvisionGate",
        rootTag: "KuveytTurkVPosMessage",
        apiVersion: "TDV2.0.0",
        requestResponseKey: "VPosTransactionResponseContract",
      });
    case BankCodes.VAKIF_KATILIM:
      return new KatilimGateway(bank, {
        non3DLive:
          "https://boa.vakifkatilim.com.tr/VirtualPOS.Gateway/Home/Non3DPayGate",
        threeDLive:
          "https://boa.vakifkatilim.com.tr/VirtualPOS.Gateway/Home/ThreeDModelPayGate",
        threeDProvisionLive:
          "https://boa.vakifkatilim.com.tr/VirtualPOS.Gateway/Home/ThreeDModelProvisionGate",
        rootTag: "VPosMessageContract",
        apiVersion: "1.0.0",
        includeHashPassword: true,
        requestResponseKey: "VPosTransactionResponseContract",
        usePaymentType: true,
      });
    default:
      return undefined;
  }
};
