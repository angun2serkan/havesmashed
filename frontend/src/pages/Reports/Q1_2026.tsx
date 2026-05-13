// Q1 2026 quarterly report.
//
// First sample/template report. Numbers are placeholders — replace with
// actual snapshot values pulled from /admin/stats/snapshot at quarter close.
// Use this file as the template for future quarters: copy → rename →
// update meta + section content + numbers, then register in `index.ts`.

import { ReportLayout, Section, StatRow } from "./ReportLayout";
import type { ReportMeta } from "./ReportLayout";

const META: ReportMeta = {
  slug: "q1-2026",
  title: "havesmashed Türkiye Dating Index — Q1 2026",
  period: "Q1 2026 · Ocak – Mart",
  publishedAt: "2026-04-15",
  summary:
    "Türkiye'de dating davranışının çeyreklik anonim raporu. Kohort sayıları, şehir dağılımı ve davranış trendleri.",
};

export function Q1_2026() {
  return (
    <ReportLayout meta={META}>
      <Section title="Özet">
        <p>
          Q1 2026 boyunca havesmashed kullanıcıları{" "}
          <strong className="text-white">[X.XXX]</strong> aktif date logu yarattı.
          Türkiye'de active dater segmentinin (son 30 günde 3+ date logu) kohort
          büyüklüğü çeyrek sonunda{" "}
          <strong className="text-white">[X.XXX]</strong> kullanıcıya ulaştı.
          Single proxy segmenti (aktif partner kaydı olmayan)
          <strong className="text-white"> [X.XXX]</strong> kullanıcı.
        </p>
      </Section>

      <StatRow
        stats={[
          { label: "Kayıtlı Kullanıcı", value: "[X.XXX]", sub: "31 Mart itibarıyla" },
          { label: "MAU (Mart)", value: "[X.XXX]" },
          { label: "Active Dater", value: "[X.XXX]", sub: "30g kohort" },
          { label: "Toplam Date Logu", value: "[X.XXX]", sub: "kümülatif" },
        ]}
      />

      <Section title="Şehir Dağılımı">
        <p>
          Çeyrekte en yoğun aktivite{" "}
          <strong className="text-white">[İstanbul, Ankara, İzmir]</strong> üçlüsünde
          gerçekleşti. Toplam date logunun yaklaşık{" "}
          <strong className="text-white">[%XX]</strong>'i bu üç metropolden geliyor.
        </p>
        <ul className="list-disc list-inside text-sm text-dark-300 space-y-1 mt-3">
          <li>İstanbul — [X.XXX] date logu</li>
          <li>Ankara — [X.XXX]</li>
          <li>İzmir — [X.XXX]</li>
          <li>Bursa — [X.XXX]</li>
          <li>Antalya — [X.XXX]</li>
        </ul>
      </Section>

      <Section title="Davranış Trendleri">
        <p>
          Hafta sonu (Cuma–Pazar) date logu hafta içine göre yaklaşık
          <strong className="text-white"> [%XX]</strong> daha yüksek. En yoğun gün
          <strong className="text-white"> [Cumartesi]</strong>.
        </p>
        <p>
          Kullanıcıların{" "}
          <strong className="text-white">[%XX]</strong>'i son 30 günde en az bir date
          logladı (active rate). Median kullanıcı{" "}
          <strong className="text-white">[XX gün]</strong>de bir date logluyor.
        </p>
      </Section>

      <Section title="Audience Composition">
        <p>
          Partner cinsiyet dağılımına göre dolaylı user demografisi:
          <strong className="text-white"> [%XX]</strong> ağırlıklı kadın partner
          logluyor (straight male / lesbian segment),{" "}
          <strong className="text-white">[%XX]</strong> ağırlıklı erkek partner,{" "}
          <strong className="text-white">[%XX]</strong> karışık.
        </p>
        <p>
          Partner yaş aralığı dağılımında en kalabalık kohortlar{" "}
          <strong className="text-white">[23–27]</strong> ve{" "}
          <strong className="text-white">[28–32]</strong>.
        </p>
      </Section>

      <Section title="Mekan & Aktivite Affinity">
        <p>
          Tag kategorisi dağılımı: venue tag'leri tüm date'lerin{" "}
          <strong className="text-white">[%XX]</strong>'ünde, activity tag'leri{" "}
          <strong className="text-white">[%XX]</strong>'ünde kullanılıyor. En yaygın
          venue tag'leri: <em>[bar, restaurant, cafe]</em>.
        </p>
      </Section>

      <Section title="Q2 öngörüleri">
        <p>
          Hava ısınmasıyla outdoor venue tag'lerinin payının yükselmesi, yaz aylarına
          doğru date frekansının artması bekleniyor. Çeyrek sonunda Q2 raporu
          yayınlanacak.
        </p>
      </Section>

      <Section title="Markalar için">
        <p className="text-sm">
          Bu rapordaki kohortlar üzerinden anonim reach paketi almak için{" "}
          <a
            href="mailto:partners@haveismash.com?subject=Q1%202026%20Media%20Kit"
            className="text-neon-400 hover:text-neon-300 underline"
          >
            partners@haveismash.com
          </a>
          .
        </p>
      </Section>
    </ReportLayout>
  );
}
