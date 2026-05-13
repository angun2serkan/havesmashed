import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

export interface ReportMeta {
  slug: string;
  title: string;
  period: string;
  publishedAt: string;
  summary: string;
}

export function ReportLayout({
  meta,
  children,
}: {
  meta: ReportMeta;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1 text-xs text-neon-400 hover:text-neon-300 mb-6"
        >
          <ArrowLeft size={12} /> Tüm raporlar
        </Link>

        <p className="text-xs font-mono text-neon-500 uppercase tracking-widest mb-3">
          havesmashed · {meta.period}
        </p>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
          {meta.title}
        </h1>
        <p className="text-base text-dark-300 leading-relaxed mb-2">
          {meta.summary}
        </p>
        <p className="text-xs text-dark-500 mb-10">
          Yayın tarihi: {meta.publishedAt}
        </p>

        <article className="prose-report space-y-6">{children}</article>

        <div className="mt-12 p-5 border border-accent-cyan/20 bg-accent-cyan/5 rounded-xl">
          <div className="flex items-start gap-3">
            <Shield size={18} className="text-accent-cyan shrink-0 mt-0.5" />
            <div className="text-xs text-dark-300 leading-relaxed">
              <strong className="text-white">Anonimlik:</strong> Bu rapordaki tüm
              sayılar aggregate kohortları temsil eder. Hiçbir kohort 1000 kullanıcıdan
              küçük değildir; daha küçük kohortlar yayınlanmaz. Hiçbir kullanıcı
              kimliği, hash'i veya kişisel verisi 3. taraflara verilmez.{" "}
              <Link
                to="/privacy"
                className="text-accent-cyan hover:text-cyan-300 underline"
              >
                Detay
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-dark-500">
          <Link to="/" className="hover:text-dark-300">
            havesmashed.com
          </Link>{" "}
          ·{" "}
          <a
            href="mailto:partners@haveismash.com"
            className="hover:text-dark-300"
          >
            partners@haveismash.com
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Report content primitives ─────────────────────────────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="py-2">
      <h2 className="text-xl md:text-2xl font-bold text-white mb-3">{title}</h2>
      <div className="text-dark-200 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function StatRow({
  stats,
}: {
  stats: Array<{ label: string; value: string; sub?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-dark-800/60 border border-dark-700 rounded-xl p-4"
        >
          <p className="text-[10px] uppercase tracking-wide text-dark-400 font-medium">
            {s.label}
          </p>
          <p className="text-2xl font-bold text-neon-400 mt-1">{s.value}</p>
          {s.sub && <p className="text-[10px] text-dark-500 mt-1">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function Quote({
  text,
  source,
}: {
  text: string;
  source?: string;
}) {
  return (
    <blockquote className="border-l-2 border-neon-500 pl-4 my-6">
      <p className="text-lg text-white italic">"{text}"</p>
      {source && <p className="text-xs text-dark-500 mt-2">— {source}</p>}
    </blockquote>
  );
}
