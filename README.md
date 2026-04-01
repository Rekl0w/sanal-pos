# @rekl0w/sanal-pos

`evrenonur/sanalpos` yaklaşımını Node.js, Bun ve TypeScript dünyasına taşıyan, testli ve npm paketlemeye hazır bir sanal POS orkestrasyon katmanı.

Bu repo iki şekilde kullanılabilir:

- **Kütüphane olarak:** `SanalPosClient` üzerinden satış, 3D dönüş, iptal, iade ve sorgu akışları
- **HTTP API olarak:** Hono üstünden JSON endpoint'leri ile servisleşmiş kullanım

> Not: Bu sürüm, referans projedeki gerçek banka / provider akışlarını TypeScript tarafına async olarak taşır. Node.js ve Bun ile kullanılabilir; dokümante edilmemiş katalog kayıtları için fallback davranış korunur, dokümante edilen gateway aileleri gerçek HTTP/XML/JSON transport ile çalışır.

## Özellikler

- Hono + Node.js/Bun + TypeScript mimarisi
- Referans listedeki **47 banka / ödeme kuruluşu** kataloğu
- Tek istemci sınıfı: async `SanalPosClient`
- 3D'siz satış ve 3D satış başlangıç akışları
- 3D callback / dönüş işleme akışı
- İptal ve iade işlemleri
- BIN ve taksit sorguları
- Banka listesi filtreleme
- Gerçek gateway contract testleri + opsiyonel canlı smoke testleri
- Zod tabanlı request doğrulama
- Vitest ile kapsamlı test seti
- Güvenlik taraması yapılmış bağımlılıklar

## Gereksinimler

- Node.js >= 18.18.0 veya Bun >= 1.3.0
- TypeScript >= 6
- XML/JSON tabanlı banka gateway'leri için ağ erişimi
- Canlı smoke test için `.env.example` dosyasından türetilmiş bir `.env` ve gerçek merchant bilgileri

## Kurulum

Kütüphane olarak kurmak için:

```bash
npm install @rekl0w/sanal-pos
```

Alternatifleri:

```bash
pnpm add @rekl0w/sanal-pos
yarn add @rekl0w/sanal-pos
bun add @rekl0w/sanal-pos
```

Repo geliştirme kurulumu için:

```bash
npm install
```

## Kullanılabilir sanal POS'lar

| Sanal POS             | Satış | Satış 3D | İptal | İade | Durum              |
| --------------------- | :---: | :------: | :---: | :--: | ------------------ |
| Akbank                |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Akbank Nestpay        |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Albaraka Türk         |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| Alternatif Bank       |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Anadolubank           |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Denizbank             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Fibabanka             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| QNB Finansbank        |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Finansbank Nestpay    |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Garanti BBVA          |  ✔️   |    ✔️    |  ❌   |  ❌  | Gerçek gateway     |
| Halkbank              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| HSBC                  |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| ING Bank              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| İş Bankası            |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Odeabank              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| Türk Ekonomi Bankası  |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Türkiye Finans        |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Vakıfbank             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Yapı Kredi Bankası    |  ✔️   |    ✔️    |  ❌   |  ❌  | Gerçek gateway     |
| Şekerbank             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Ziraat Bankası        |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Aktif Yatırım Bankası |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| Kuveyt Türk           |  ✔️   |    ✔️    |  ❌   |  ❌  | Gerçek gateway     |
| Vakıf Katılım         |  ✔️   |    ✔️    |  ❌   |  ❌  | Gerçek gateway     |
| Ziraat Katılım        |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| PayNKolay             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| HalkÖde               |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Tami                  |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| VakıfPayS             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| ZiraatPay             |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Vepara                |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Moka                  |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Ahlpay                |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| IQmoney               |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Parolapara            |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| PayBull               |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| ParamPos              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| QNBpay                |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Sipay                 |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Hepsipay              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| Payten (MSU)          |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| PayTR                 |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| IPara                 |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| PayU                  |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Fallback / katalog |
| Iyzico                |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Cardplus              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |
| Paratika              |  ✔️   |    ✔️    |  ✔️   |  ✔️  | Gerçek gateway     |

> `Fallback / katalog` etiketi, bu repodaki katalog kaydının `documented: false` olmasına ve `BankService.createGateway()` çağrısında gerçek gateway yerine `SandboxGateway` çözülmesine dayanır. Yani bu kayıtlar katalogda vardır; ancak bu pakette şu an gerçek binding yerine kontrollü fallback davranışı ile çalışır.

## Çalıştırma

Geliştirme:

```bash
npm run dev
```

Normal çalıştırma:

```bash
npm run start
```

Varsayılan port: `3000`

> Aynı scriptler hem `npm run ...` hem `bun run ...` ile çalışır. Örneğin `npm run start` yerine doğrudan `bun run start` da kullanabilirsiniz.

## Test ve doğrulama

Testler:

```bash
npm test
```

Tip kontrolü:

```bash
npm run typecheck
```

Toplu kontrol:

```bash
npm run check
```

Paket build:

```bash
npm run build
```

Opsiyonel canlı smoke test:

```bash
# .env.example dosyasını .env olarak kopyalayıp merchant bilgilerini doldurduktan sonra
npm run test:live
```

Bağımlılık güvenlik taraması:

```bash
npm audit
```

## API bilgileri - `MerchantAuth`

| Alan                | Tür       | Açıklama                                                                              |
| ------------------- | --------- | ------------------------------------------------------------------------------------- |
| `bank_code`         | `string`  | Banka / ödeme kuruluşu kodu. `BankCodes` veya `BankService` sabitleri kullanılabilir. |
| `merchant_id`       | `string`  | Firma kodu / üye işyeri numarası / client code                                        |
| `merchant_user`     | `string`  | API kullanıcı adı / terminal no / app id                                              |
| `merchant_password` | `string`  | API şifresi / terminal safe id / secret                                               |
| `merchant_storekey` | `string`  | 3D store key / merchant key / guid / secret key                                       |
| `test_platform`     | `boolean` | `true` test ortamı, `false` canlı ortam                                               |

## Banka bazlı credential alan eşlemesi

| Sanal POS        | `bank_code`              | `merchant_id`            | `merchant_user`   | `merchant_password`                  | `merchant_storekey`      |
| ---------------- | ------------------------ | ------------------------ | ----------------- | ------------------------------------ | ------------------------ |
| Akbank           | `BankCodes.AKBANK`       | İş Yeri No               | `merchantSafeId`  | `terminalSafeId`                     | Secret Key               |
| Nestpay ailesi   | İlgili Nestpay kodu      | Mağaza Kodu              | API Kullanıcısı   | API Şifresi                          | 3D Storekey              |
| Garanti BBVA     | `BankCodes.GARANTI_BBVA` | Firma Kodu               | Terminal No       | PROVAUT Şifresi                      | 3D Anahtarı              |
| Vakıfbank        | `BankCodes.VAKIFBANK`    | Üye İşyeri No            | POS No            | API Şifresi                          | —                        |
| Yapı Kredi       | `BankCodes.YAPI_KREDI`   | Firma Kodu               | Terminal No       | PosNet ID                            | ENCKEY                   |
| CCPayment ailesi | İlgili CCPayment kodu    | Üye İşyeri ID            | Uygulama Anahtarı | Uygulama Parolası                    | Merchant Key             |
| ParamPos         | `BankCodes.PARAMPOS`     | Client Code              | Kullanıcı Adı     | Şifre                                | Guid Anahtar             |
| Moka             | `BankCodes.MOKA`         | Bayi Kodu                | API Kullanıcısı   | API Şifresi                          | —                        |
| Ahlpay           | `BankCodes.AHLPAY`       | Member ID                | API Kullanıcısı   | API Şifresi                          | API Key                  |
| Payten ailesi    | İlgili Payten kodu       | Firma Kodu               | API Kullanıcısı   | API Şifresi                          | Dealer Type / ek anahtar |
| Tami             | `BankCodes.TAMI`         | Üye İşyeri No            | Terminal No       | `KidValue / KValue` (pipe-separated) | Secret Key               |
| PayNKolay        | `BankCodes.PAYNKOLAY`    | `sx` token / merchant id | `sx` list         | `sx` iptal                           | Secret Key               |
| Iyzico           | `BankCodes.IYZICO`       | Üye İşyeri No            | API Anahtarı      | Güvenlik Anahtarı                    | —                        |

## HTTP API

### Sağlık kontrolü

`GET /health`

### Banka listesi

`GET /api/banks`

İsteğe bağlı filtreler:

- `collective_vpos=true|false`
- `installment_api=true|false`
- `supports_refund=true|false`

### Tek banka detayı

`GET /api/banks/:bankCode`

### Satış

`POST /api/sale`

Örnek payload:

```json
{
  "auth": {
    "bank_code": "9990",
    "merchant_id": "20158",
    "merchant_user": "07fb70f9d8de575f32baa6518e38c5d6",
    "merchant_password": "61d97b2cac247069495be4b16f8604db",
    "merchant_storekey": "$2y$10$N9IJkgazXMUwCzpn7NJrZePy3v.dIFOQUyW4yGfT3eWry6m.KxanK",
    "test_platform": true
  },
  "request": {
    "order_number": "ORDER-001",
    "customer_ip_address": "1.1.1.1",
    "sale_info": {
      "card_name_surname": "test kart",
      "card_number": "4022780520669303",
      "card_expiry_month": 1,
      "card_expiry_year": 2050,
      "card_cvv": "988",
      "amount": 10,
      "currency": 949,
      "installment": 1
    },
    "payment_3d": {
      "confirm": false
    },
    "invoice_info": {
      "name": "cem",
      "surname": "pehlivan"
    },
    "shipping_info": {
      "name": "cem",
      "surname": "pehlivan"
    }
  }
}
```

### 3D dönüş işleme

`POST /api/sale/3d-response`

### İptal

`POST /api/cancel`

### İade

`POST /api/refund`

### BIN sorgusu

`POST /api/query/bin`

### Satış sorgusu

`POST /api/query/sale`

### Taksit sorguları

- `POST /api/query/installments/all`
- `POST /api/query/installments/additional`

## Kütüphane kullanımı

```ts
import { BankCodes, CurrencyMap, SanalPosClient } from "@rekl0w/sanal-pos";

const response = await SanalPosClient.sale(
  {
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
    payment_3d: { confirm: false },
    invoice_info: { name: "cem", surname: "pehlivan" },
    shipping_info: { name: "cem", surname: "pehlivan" },
  },
  {
    bank_code: BankCodes.QNBPAY,
    merchant_id: "20158",
    merchant_user: "07fb70f9d8de575f32baa6518e38c5d6",
    merchant_password: "61d97b2cac247069495be4b16f8604db",
    merchant_storekey:
      "$2y$10$N9IJkgazXMUwCzpn7NJrZePy3v.dIFOQUyW4yGfT3eWry6m.KxanK",
    test_platform: true,
  },
);

console.log(response.status, response.transaction_id);
```

## Desteklenen işlem yüzeyi

- `sale`
- `sale3DResponse`
- `cancel`
- `refund`
- `binInstallmentQuery`
- `allInstallmentQuery`
- `additionalInstallmentQuery`
- `saleQuery`
- `allBankList`

## Mimari

```text
src/
├── app.ts                      # Hono uygulaması
├── client/
│   └── sanalpos-client.ts      # Tek giriş istemcisi
├── domain/
│   ├── banks.ts                # Banka / provider kataloğu
│   ├── enums.ts                # Enum sabitleri
│   ├── schemas.ts              # Zod şemaları
│   └── types.ts                # Domain tipleri
├── gateways/
│   ├── abstract-gateway.ts     # Ortak gateway soyutlaması
│   ├── bank-gateways.ts        # Gerçek banka gateway implementasyonları
│   ├── provider-gateways.ts    # Gerçek provider gateway implementasyonları
│   ├── sandbox-gateway.ts      # Deterministic sandbox davranışı
│   └── types.ts                # Gateway interface'i
├── infra/
│   ├── http-client.ts          # HTTP taşıma katmanı
│   ├── payment-utils.ts        # Hash/format yardımcıları
│   ├── xml.ts                  # XML parse/build yardımcıları
│   └── iyzico-pki.ts           # Iyzico PKI/JWT yardımcıları
├── config/
│   └── gateway-config.ts       # Endpoint ve familya konfigurasyonları
└── services/
    ├── bank-service.ts         # Banka servis katmanı
    ├── bin-service.ts          # BIN / taksit mantığı
    ├── sanitizer-service.ts    # Veri sanitizasyonu
    └── validation-service.ts   # İş kuralı validasyonları
```

## Güvenlik notu

- `axios` kullanılmadı
- `npm audit` ve `bun audit` ile temiz doğrulama alınabilir
- Kart ve müşteri alanları sanitize edilir
- Doğrulama hataları kontrollü JSON response olarak döner

## Hata yönetimi

Gerçek HTTP isteklerinde bağlantı, timeout veya upstream hata durumları `HttpRequestError` olarak yükseltilir. İş kuralı / input problemleri ise `ValidationError` üzerinden döner.

```ts
import {
  HttpRequestError,
  SanalPosClient,
  ValidationError,
} from "@rekl0w/sanal-pos";

try {
  const response = await SanalPosClient.sale(request, auth);
  console.log(response.status);
} catch (error) {
  if (error instanceof HttpRequestError) {
    console.error(error.url, error.statusCode, error.responseBody);
  }

  if (error instanceof ValidationError) {
    console.error(error.issues);
  }
}
```

## Canlı entegrasyon notu

- `SanalPosClient` metotları **async** çalışır
- Dokümante edilen bankalar/providerlar `BankService.createGateway` içinde gerçek gateway sınıflarına bağlanır
- Dokümante edilmemiş katalog kayıtları kontrollü fallback ile çalışmaya devam eder
- Paketle birlikte `.env.example` gelir; bunu `.env` olarak kopyalayıp gerçek smoke testleri buradan yönetebilirsiniz

## Referans

- Bu proje, `evrenonur/sanalpos` repo akışlarını TypeScript/Bun tarafına taşır.
- Referans PHP paketinin kendisi de `cempehlivan/CP.VPOS` mimarisi üzerine kuruludur.
