import { BankCodes } from "../domain/banks";

export const paynetConfig = {
  testBase: "https://pts-api.paynet.com.tr",
  liveBase: "https://api.paynet.com.tr",
} as const;

export const nestpayConfig = {
  [BankCodes.AKBANK_NESTPAY]: {
    apiLive: "https://www.sanalakpos.com/fim/api",
    threeDLive: "https://www.sanalakpos.com/fim/est3Dgate",
  },
  [BankCodes.ALTERNATIF_BANK]: {
    apiLive: "https://sanalpos.abank.com.tr/fim/api",
    threeDLive: "https://sanalpos.abank.com.tr/fim/est3Dgate",
  },
  [BankCodes.ANADOLUBANK]: {
    apiLive: "https://anadolusanalpos.est.com.tr/fim/api",
    threeDLive: "https://anadolusanalpos.est.com.tr/fim/est3Dgate",
  },
  [BankCodes.CARDPLUS]: {
    apiLive: "https://sanalpos.card-plus.net/fim/api",
    threeDLive: "https://sanalpos.card-plus.net/fim/est3Dgate",
  },
  [BankCodes.FINANSBANK_NESTPAY]: {
    apiLive: "https://www.fbwebpos.com/fim/api",
    threeDLive: "https://www.fbwebpos.com/fim/est3Dgate",
  },
  [BankCodes.HALKBANK]: {
    apiLive: "https://sanalpos.halkbank.com.tr/fim/api",
    threeDLive: "https://sanalpos.halkbank.com.tr/fim/est3Dgate",
  },
  [BankCodes.ING_BANK]: {
    apiLive: "https://sanalpos.ingbank.com.tr/fim/api",
    threeDLive: "https://sanalpos.ingbank.com.tr/fim/est3Dgate",
  },
  [BankCodes.IS_BANKASI]: {
    apiLive: "https://sanalpos.isbank.com.tr/fim/api",
    threeDLive: "https://sanalpos.isbank.com.tr/fim/est3Dgate",
    apiTest: "https://istest.asseco-see.com.tr/fim/api",
    threeDTest: "https://istest.asseco-see.com.tr/fim/est3Dgate",
  },
  [BankCodes.SEKERBANK]: {
    apiLive: "https://sanalpos.sekerbank.com.tr/fim/api",
    threeDLive: "https://sanalpos.sekerbank.com.tr/fim/est3Dgate",
  },
  [BankCodes.TURK_EKONOMI_BANKASI]: {
    apiLive: "https://sanalpos.teb.com.tr/fim/api",
    threeDLive: "https://sanalpos.teb.com.tr/fim/est3Dgate",
  },
  [BankCodes.TURKIYE_FINANS]: {
    apiLive: "https://sanalpos.turkiyefinans.com.tr/fim/api",
    threeDLive: "https://sanalpos.turkiyefinans.com.tr/fim/est3Dgate",
  },
  [BankCodes.ZIRAAT_BANKASI]: {
    apiLive: "https://sanalpos2.ziraatbank.com.tr/fim/api",
    threeDLive: "https://sanalpos2.ziraatbank.com.tr/fim/est3Dgate",
    apiTest: "https://torus-stage-ziraat.asseco-see.com.tr/fim/api",
    threeDTest: "https://torus-stage-ziraat.asseco-see.com.tr/fim/est3Dgate",
  },
} as const;

export const ccpaymentConfig = {
  [BankCodes.HALKODE]: {
    testBase: "https://testapp.halkode.com.tr/ccpayment",
    liveBase: "https://app.halkode.com.tr/ccpayment",
  },
  [BankCodes.IQMONEY]: {
    testBase: "https://provisioning.iqmoneytr.com/ccpayment",
    liveBase: "https://app.iqmoneytr.com/ccpayment",
  },
  [BankCodes.PAROLAPARA]: {
    testBase: "https://test.parolapara.com.tr/ccpayment",
    liveBase: "https://app.parolapara.com.tr/ccpayment",
  },
  [BankCodes.PAYBULL]: {
    testBase: "https://test.paybull.com/ccpayment",
    liveBase: "https://app.paybull.com/ccpayment",
  },
  [BankCodes.QNBPAY]: {
    testBase: "https://test.qnbpay.com.tr/ccpayment",
    liveBase: "https://portal.qnbpay.com.tr/ccpayment",
  },
  [BankCodes.SIPAY]: {
    testBase: "https://provisioning.sipay.com.tr/ccpayment",
    liveBase: "https://app.sipay.com.tr/ccpayment",
    skipPaymentStatusCheck: true,
    cardProgramFieldName: "getpos_card_program",
    completePaymentRequiresAppLang: true,
  },
  [BankCodes.VEPARA]: {
    testBase: "https://test.vepara.com.tr/ccpayment",
    liveBase: "https://app.vepara.com.tr/ccpayment",
  },
} as const;

export const paytenConfig = {
  [BankCodes.PARATIKA]: {
    apiTest: "https://entegrasyon.paratika.com.tr/paratika/api/v2",
    apiLive: "https://vpos.paratika.com.tr/paratika/api/v2",
    threeDTest:
      "https://entegrasyon.paratika.com.tr/paratika/api/v2/post/sale3d/{0}",
    threeDLive: "https://vpos.paratika.com.tr/paratika/api/v2/post/sale3d/{0}",
    brandName: "Paratika",
  },
  [BankCodes.PAYTEN]: {
    apiTest: "https://entegrasyon.asseco-see.com.tr/msu/api/v2",
    apiLive: "https://merchantsafeunipay.com/msu/api/v2",
    threeDTest:
      "https://entegrasyon.asseco-see.com.tr/msu/api/v2/post/sale3d/{0}",
    threeDLive: "https://merchantsafeunipay.com/msu/api/v2/post/sale3d/{0}",
    brandName: "Payten",
  },
  [BankCodes.VAKIFPAYS]: {
    apiTest: "https://testpos.vakifpays.com.tr/vakifpays/api/v2",
    apiLive: "https://pos.vakifpays.com.tr/vakifpays/api/v2",
    threeDTest:
      "https://testpos.vakifpays.com.tr/vakifpays/api/v2/post/sale3d/{0}",
    threeDLive: "https://pos.vakifpays.com.tr/vakifpays/api/v2/post/sale3d/{0}",
    brandName: "VakıfPayS",
    onlineMetrixOrgId: "6bmm5c3v",
  },
  [BankCodes.ZIRAATPAY]: {
    apiTest: "https://test.ziraatpay.com.tr/ziraatpay/api/v2",
    apiLive: "https://vpos.ziraatpay.com.tr/ziraatpay/api/v2",
    threeDTest:
      "https://test.ziraatpay.com.tr/ziraatpay/api/v2/post/sale3d/{0}",
    threeDLive:
      "https://vpos.ziraatpay.com.tr/ziraatpay/api/v2/post/sale3d/{0}",
    brandName: "ZiraatPay",
    onlineMetrixOrgId: "6bmm5c3v",
  },
} as const;
