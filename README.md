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

`main` dalına gönderilen her değişiklik GitHub Actions ile `https://yusuf-aydemir.github.io/personal-dashboard-supabase/` adresine yayınlanır. Depoda **Settings → Pages → Build and deployment → Source** ayarını **GitHub Actions** olarak seç. İlk dağıtım tamamlandıktan sonra Supabase **Authentication → URL Configuration → Redirect URLs** listesine `https://yusuf-aydemir.github.io/personal-dashboard-supabase/**` ekle.

## Veri saklama ve sonraki adımlar

Gelir, gider, bütçe, haftalık plan ve iş ilanları oturum açtığında Supabase hesabınla eşitlenir. Oturum açmadan önce veriler bu tarayıcıda saklanır. Supabase eşitlemesini etkinleştirmek için:

1. Supabase SQL Editor'da `supabase/migrations/20261116193000_create_jobs.sql` dosyasını çalıştır.
2. Supabase SQL Editor'da `supabase/migrations/20261117114300_sync_user_data.sql` dosyasını çalıştır.
3. Supabase SQL Editor'da `supabase/migrations/20261118120000_mcp_weekly_schedule.sql` dosyasını çalıştır.
4. Authentication → URL Configuration bölümünde `http://127.0.0.1:8765/**` (yerel deneme) ve `https://yusuf-aydemir.github.io/personal-dashboard-supabase/**` (yayınlanmış uygulama) adreslerini izin verilen yönlendirmelere ekle.
5. E-posta ile kodla giriş için Authentication → Email Templates → Magic Link şablonuna `{{ .Token }}` ekle. Uygulama bağlantının yanında e-posta kodunu da gönderir.
6. Uygulamayı `localhost` veya GitHub Pages HTTPS adresinden açıp **Giriş yap** düğmesinden kod iste; e-postadaki 6 haneli kodu uygulamaya gir. Böylece e-posta bağlantısını Safari'de açmak gerekmez.
7. Oturum açtıktan sonra hesap penceresindeki **Parolayı belirle / değiştir** formunu kullan. Sonraki cihazlarda aynı e-posta ve parolayla giriş yapabilirsin; bu normal girişte e-posta göndermez. E-posta kodu yöntemi de yedek olarak kullanılabilir.

## Claude Mobile ile sesli haftalık plan

Claude Mobile'da sesli konuşarak haftalık planı güncellemek için:

1. Uygulamada Supabase hesabına en az bir kez giriş yap; bu, haftalık plan kaydını oluşturur.
2. Supabase SQL Editor'da `supabase/migrations/20261118120000_mcp_weekly_schedule.sql` dosyasını çalıştır.
3. Supabase Edge Functions → Secrets bölümünde `MCP_USER_ID` (Authentication → Users tablosundaki kendi kullanıcı UUID'n) ve `MCP_API_KEY` (en az 32 karakterlik rastgele bir anahtar) sırlarını oluştur. Aynı API anahtarını sadece Claude bağlantı ayarında kullan; kaynak koda veya GitHub'a ekleme.
4. Supabase CLI ile projeye bağlanıp `supabase functions deploy weekly-schedule-mcp --project-ref nwjwwpqgqdlvsgbximyx` komutuyla sunucuyu dağıt. `supabase/config.toml`, bu fonksiyonda Supabase JWT kontrolünü kapatır; fonksiyon bunun yerine `Authorization: Bearer <MCP_API_KEY>` başlığını doğrular. Supabase'in `SUPABASE_SERVICE_ROLE_KEY` sırrı yalnızca sunucu tarafında kullanılır.
5. Claude Web veya Mobile'da **Settings → Connectors → Add custom connector** bölümünden şu adresi ekle: `https://nwjwwpqgqdlvsgbximyx.supabase.co/functions/v1/weekly-schedule-mcp`. Web arayüzünde bu seçenek **Plugins → Your plugins → Add → Add custom connector** altında olabilir.
6. Giriş yöntemi olarak **No sign-in** seçip `Authorization` başlığına `Bearer <MCP_API_KEY>` değerini gir.
7. Değişikliklerin ayrıca onay sorulmadan uygulanmasını istiyorsan connector'ın **Permissions** bölümünde yalnızca **Get weekly schedule** ve **Update weekly schedule** araçlarını **Always allow** yap; aksi halde **Needs approval** bırak.
8. Yeni sohbette connector'ı etkinleştirip sesli konuşmada “Her çarşamba 18:00–20:00 meşgul, cumartesi 10:00–12:00 boş yap” gibi bir istek ver.

Claude yalnızca haftalık planı okuyabilir ve güncelleyebilir; finans veya iş ilanlarına erişemez. Belirtilen tam saat aralıkları haftalık tekrar eder; 06:00–24:00 dışına çıkılamaz ve istenmeyen saatler korunur. Değişiklikler otomatik kaydedilir. Bu Edge Function, GitHub Pages dağıtımından ayrı olarak Supabase'e dağıtılır.

İlanlar ve diğer kullanıcı verileri Supabase'de hesaba bağlı olarak saklanır; Row Level Security ile yalnızca ilgili kullanıcı erişebilir. Kullanıcının ilk girişi sırasında bulut kaydı yoksa o cihazdaki finans ve plan verileri ilk bulut kaydı olarak yüklenir; bulut kaydı zaten varsa buluttaki veriler kullanılır. Supabase URL ve publishable key `supabase-config.js` dosyasındadır; publishable key tarayıcıda kullanılmak içindir, ancak `secret` veya `service_role` anahtarını bu dosyaya koyma. `weekly-schedule-mcp` sunucusu yalnızca haftalık planı değiştirmek üzere tasarlanmıştır; henüz ilan veya finans değişikliği için araç sağlamaz.
