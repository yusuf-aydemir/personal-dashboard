# Kişisel Alan

Telefon ve bilgisayarda kullanılabilen, yüklenebilir bir web uygulaması prototipi. Finans ve haftalık plan bölümlerini içerir.

## Şu an neler yapılabilir?

- Aylık geliri ve sabit giderleri girme
- Kategori adını ve bütçe tutarını sabit gider ekler gibi elle ekleme veya kaldırma
- Kendi kategorilerine harcama ekleme ve bütçe çubuklarında harcanan/kalan tutarları görme
- Pazartesi–pazar günleri için 06:00–24:00 saat aralığında boş/meşgul zamanları işaretleme
- Uygulamayı desteklenen tarayıcılarda ana ekrana yükleme ve önceden açılmış uygulamayı çevrimdışı kullanma

Hazır bütçe kategorisi yoktur; kategori adlarını ve tutarlarını kullanıcı belirler. Toplam ayırdığın tutar kullanılabilir parayı aşarsa uygulama bunu belirtir. Para birimi başlangıçta TRY'dir ve değiştirilebilir.

## Yerel önizleme

Klasörü VS Code'da açıp Live Server gibi bir yerel web sunucusuyla `index.html` dosyasını çalıştır. Service worker ve ana ekrana yükleme özellikleri için uygulamayı `localhost` veya HTTPS üzerinden aç.

## Veri saklama ve sonraki adımlar

Bu prototip gelir, gider ve plan verilerini yalnızca açıldığı tarayıcının yerel depolamasında tutar. Veriler cihazlar arasında eşitlenmez; tarayıcı verileri silinirse kaybolabilir. Paylaşımlı kullanım için ayrı bir Firebase projesi, erişim kuralları ve kimlik doğrulama kurulması gerekir. Bu bağlantı ve verilerin üzerinde değişiklik yapabilen ajan henüz eklenmemiştir; güvenli başlangıç olarak ajan öneri sunmalı, değişiklik senin onayından sonra uygulanmalıdır.
