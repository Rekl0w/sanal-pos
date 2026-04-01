# Release Notes — v0.1.0

`@rekl0w/sanal-pos` için ilk herkese açık sürüm.

## Öne çıkanlar

- Node.js ve Bun ile kullanılabilen TypeScript tabanlı sanal POS kütüphanesi
- `@rekl0w/sanal-pos` scoped npm paket adı
- Gerçek gateway binding'leri ile referans repo parity'sine yakın çekirdek akışlar
- Hono tabanlı HTTP API yüzeyi
- Ortak `npm run ...` ve `bun run ...` komut akışı
- `.env.example`, `CONTRIBUTING.md`, issue template ve PR template ile yayınlık repo yüzeyi

## Bu sürümde neler var?

### Gateway kapsamı

- Referans repodaki somut gateway implementasyonları bu projeye taşındı
- Dokümante edilen gateway aileleri gerçek binding ile çözülüyor
- Dokümante edilmemiş katalog kayıtları kontrollü fallback davranışıyla korunuyor

### Geliştirici deneyimi

- npm ve Bun için ortak script akışı
- Node.js uyumlu çalışma modeli
- Vitest tabanlı test altyapısı
- `npm pack --dry-run` ile doğrulanmış paket yüzeyi

### Paketleme ve repo düzeni

- doğru `repository`, `homepage` ve `bugs` alanları
- publish için gerekli `files` listesi
- `.env.example` tek kanonik environment şablonu
- issue / contribution / PR dokümantasyonu

## Doğrulama özeti

- `npm run check` ✅
- `bun run check` ✅
- `npm pack --dry-run` ✅

## Bilinen sınırlar

- Live smoke testler varsayılan olarak kapalıdır; sadece `RUN_LIVE_TESTS=true` ile açılır
- Katalogdaki bazı kayıtlar fallback/sandbox davranışında kalır; bunlar README'de açıkça işaretlenmiştir

## Referanslar

- PHP referans repo: [evrenonur/sanalpos](https://github.com/evrenonur/sanalpos)
- Temel mimari referansı: [cempehlivan/CP.VPOS](https://github.com/cempehlivan/CP.VPOS)
