# Kişisel Alan

Telefon ve bilgisayarda kullanılabilen, yüklenebilir bir web uygulaması prototipi. Finans ve haftalık plan bölümlerini içerir.

## Şu an neler yapılabilir?

- Kayıtlı iş ilanlarını görüntüleme, silme, arama ve başvuru durumuna göre filtreleme
- Aylık geliri ve sabit giderleri girme
- Kategori adını ve bütçe tutarını sabit gider ekler gibi elle ekleme veya kaldırma
- Kendi kategorilerine harcama ekleme ve bütçe çubuklarında harcanan/kalan tutarları görme
- Pazartesi–pazar günleri için 06:00–24:00 saat aralığında boş/meşgul zamanları işaretleme
- Uygulamayı desteklenen tarayıcılarda ana ekrana yükleme ve önceden açılmış uygulamayı çevrimdışı kullanma

Hazır bütçe kategorisi yoktur; kategori adlarını ve tutarlarını kullanıcı belirler. Toplam ayırdığın tutar kullanılabilir parayı aşarsa uygulama bunu belirtir. Para birimi başlangıçta TRY'dir ve değiştirilebilir.

## Yerel önizleme

Klasörü VS Code'da açıp Live Server gibi bir yerel web sunucusuyla `index.html` dosyasını çalıştır. Service worker ve ana ekrana yükleme özellikleri için uygulamayı `localhost` veya HTTPS üzerinden aç.

## GitHub Pages yayını

`main` dalına gönderilen her değişiklik GitHub Actions ile `https://yusuf-aydemir.github.io/personal-dashboard/` adresine yayınlanır. Depoda **Settings → Pages → Build and deployment → Source** ayarını **GitHub Actions** olarak seç. İlk dağıtım tamamlandıktan sonra Supabase **Authentication → URL Configuration → Redirect URLs** listesine `https://yusuf-aydemir.github.io/personal-dashboard/**` ekle.

## Veri saklama ve sonraki adımlar

Gelir, gider ve plan verileri bu tarayıcıda kalır. İş ilanları da oturum açmadan önce yerel olarak gösterilir. Supabase bulut eşitlemesini etkinleştirmek için:

1. Supabase SQL Editor'da `supabase/migrations/20261116193000_create_jobs.sql` dosyasını çalıştır.
2. Authentication → URL Configuration bölümünde `http://127.0.0.1:8765/**` (yerel deneme) ve `https://yusuf-aydemir.github.io/personal-dashboard/**` (yayınlanmış uygulama) adreslerini izin verilen yönlendirmelere ekle.
3. Uygulamayı `localhost` veya GitHub Pages HTTPS adresinden açıp **Giriş yap** düğmesinden e-posta bağlantısıyla oturum aç.

İlanlar Supabase'de kullanıcı hesabına bağlı olarak saklanır ve Row Level Security ile yalnızca o kullanıcıya açılır. Supabase URL ve publishable key `supabase-config.js` dosyasındadır; publishable key tarayıcıda kullanılmak içindir, ancak `secret` veya `service_role` anahtarını bu dosyaya koyma. Claude Web'den ilan yazdırmak için ayrıca internete açık, kimliği doğrulanmış bir uzak MCP sunucusu dağıtılmalıdır; bu MCP sunucusu henüz kurulmuş değildir.
