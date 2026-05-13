import { Link } from "react-router-dom";
import { Shield, Lock, BarChart3, Ban, ToggleLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function PrivacyPage() {
  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          to="/"
          className="text-sm text-neon-400 hover:text-neon-300 transition-colors"
        >
          ← Ana sayfa
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-white mb-2">Gizlilik & Anonimlik</h1>
      <p className="text-sm text-dark-400 mb-8">
        Son güncelleme: 2026-05-09 · havesmashed
      </p>

      <div className="space-y-4">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
            <Shield size={20} className="text-accent-cyan" />
            Toplamadığımız veriler
          </h2>
          <ul className="text-sm text-dark-200 space-y-2 list-disc list-inside leading-relaxed">
            <li>Email adresi yok.</li>
            <li>Telefon numarası yok.</li>
            <li>Şifre yok — yalnızca yerel cihazında tuttuğun 12 kelimelik BIP39 cümlesi.</li>
            <li>Ad-soyad, kimlik bilgisi, doğum yeri yok.</li>
            <li>Üçüncü taraf analytics (Google Analytics, Meta Pixel vb.) yok.</li>
            <li>Cihaz fingerprint'i veya reklam ID'si toplamayız.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
            <Lock size={20} className="text-accent-cyan" />
            Tuttuğumuz veriler
          </h2>
          <p className="text-sm text-dark-300 mb-3 leading-relaxed">
            Uygulamanın çalışması için yalnızca senin girdiğin verileri tutarız:
          </p>
          <ul className="text-sm text-dark-200 space-y-2 list-disc list-inside leading-relaxed">
            <li>BIP39 cümlenin Argon2 hash'i (geri çevrilemez)</li>
            <li>Senin oluşturduğun nickname (opsiyonel)</li>
            <li>Senin loglandığın date kayıtlarının içerikleri</li>
            <li>Arkadaş bağlantıların ve forum etkileşimlerin</li>
            <li>Son giriş zamanı (oturum yönetimi için)</li>
          </ul>
          <p className="text-xs text-dark-500 mt-3 leading-relaxed">
            Bu verilerin tamamına yalnızca sen erişirsin. Arkadaşlarınla neyi paylaşacağını
            ayarlardan kontrol edersin.
          </p>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
            <BarChart3 size={20} className="text-accent-cyan" />
            Anonim aggregate istatistikler
          </h2>
          <p className="text-sm text-dark-300 mb-3 leading-relaxed">
            Ürünü iyileştirmek ve reklam ortaklarımıza çok yüksek seviyeli kohort sayıları
            sunmak için <strong className="text-white">anonim aggregate</strong> raporlar üretiriz.
          </p>
          <p className="text-sm text-dark-300 mb-3 leading-relaxed">
            Bu raporların temel kuralı:
          </p>
          <ul className="text-sm text-dark-200 space-y-2 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-white">K-anonimite ≥ 1000</strong> — yayınlanan hiçbir
              segment 1000 kişiden küçük olamaz.
            </li>
            <li>Kullanıcı kimliği, hash'i veya pseudonim hiçbir aşamada raporlara girmez.</li>
            <li>
              Reklam veren yalnızca aggregate impression/click sayıları ve segment kohort
              büyüklükleri görür — kim olduğunu öğrenemez.
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
            <Ban size={20} className="text-red-400" />
            Asla yapmadıklarımız
          </h2>
          <ul className="text-sm text-dark-200 space-y-2 list-disc list-inside leading-relaxed">
            <li>Kullanıcı verisi satmıyoruz.</li>
            <li>Hash'lenmiş kullanıcı ID'leri reklam platformlarına göndermiyoruz.</li>
            <li>Lookalike audience export yapmıyoruz (Meta, TikTok, Google Ads).</li>
            <li>Programmatic ad exchange entegrasyonu yapmıyoruz.</li>
            <li>3. taraf tracking pixel kullanmıyoruz.</li>
            <li>Kişisel verilerini reklam veren ile paylaşmıyoruz.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-3">
            <ToggleLeft size={20} className="text-accent-cyan" />
            Kontrol sende
          </h2>
          <ul className="text-sm text-dark-200 space-y-3 leading-relaxed">
            <li>
              <strong className="text-white">Anonim sayımlardan çık:</strong> Ayarlar →
              Anonim İstatistikler bölümünden tek tıkla aggregate sayımlara dahil edilmeyi
              durdurabilirsin.
            </li>
            <li>
              <strong className="text-white">Hesabını sil:</strong> Ayarlar → Tehlikeli
              Bölge → Hesap Sil. 30 gün içinde geri alabilir veya kalıcı olarak silinmesini
              bekleyebilirsin.
            </li>
            <li>
              <strong className="text-white">Verileri talep et:</strong> KVKK ve GDPR
              kapsamında verilerinin kopyasını talep edebilirsin —{" "}
              <a
                href="mailto:privacy@haveismash.com"
                className="text-neon-400 hover:text-neon-300"
              >
                privacy@haveismash.com
              </a>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white mb-3">İletişim</h2>
          <p className="text-sm text-dark-300 leading-relaxed">
            Gizlilikle ilgili soruların, talepleriniz veya bir endişeniz varsa{" "}
            <a
              href="mailto:privacy@haveismash.com"
              className="text-neon-400 hover:text-neon-300"
            >
              privacy@haveismash.com
            </a>{" "}
            adresine yazabilirsin. KVKK Kurumu'na başvuru hakkın saklıdır.
          </p>
        </Card>
      </div>
    </div>
  );
}
