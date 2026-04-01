# Contributing to @rekl0w/sanal-pos

Katkı vermek istediğiniz için teşekkürler. Bu repo, Türkiye'deki sanal POS akışlarını Node.js/Bun + TypeScript dünyasında tutarlı ve testli biçimde sunmayı hedefler.

## Hızlı başlangıç

```bash
npm install
npm run check
```

Geliştirme sunucusu:

```bash
npm run dev
```

Bun tercih ediyorsanız:

```bash
bun run dev
```

## Katkı kuralları

- Küçük ve odaklı değişiklikler yapın
- Var olan stil ve API yüzeyini koruyun
- Yeni gateway ekliyorsanız mümkünse referans implementasyonunu ve gerçek response örneklerini baz alın
- Yeni davranış ekliyorsanız test de ekleyin
- README veya `.env.example` güncellemesi gerekiyorsa kodla birlikte yapın

## Pull request checklist

- [ ] `npm run check` başarılı
- [ ] `npm run build` başarılı
- [ ] README / örnekler güncel
- [ ] Geriye dönük uyumluluk etkisi not edildi
- [ ] Gerekliyse yeni test eklendi

## Gateway katkıları için notlar

- `src/domain/banks.ts` içinde katalog kaydını güncelleyin
- `src/gateways/bank-gateways.ts` veya `src/gateways/provider-gateways.ts` içinde gerçek binding ekleyin
- Gerçek binding yoksa kayıt fallback olarak kalabilir; bu durumda dokümantasyonda net olun
- Yeni canlı test prefix'i gerekiyorsa `tests/live.integration.test.ts` ve `.env.example` dosyalarını güncelleyin

## Issue açmadan önce

- Aynı hata için açık bir issue var mı kontrol edin
- Hata raporunda `bank_code`, ortam (`test_platform`), request tipi ve mümkünse sanitize edilmiş ham response paylaşın
- Gizli anahtarları, kart verilerini ve production kişisel verilerini paylaşmayın
