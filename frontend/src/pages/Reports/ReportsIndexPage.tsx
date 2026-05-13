import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { REPORTS } from "./index";

export function ReportsIndexPage() {
  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <p className="text-xs font-mono text-neon-500 uppercase tracking-widest mb-3">
          havesmashed · raporlar
        </p>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
          Türkiye Dating Index
        </h1>
        <p className="text-base text-dark-300 leading-relaxed mb-10 max-w-2xl">
          Çeyreklik anonim trend raporları. Tüm sayılar k≥1000 kohortları temsil eder.
          Markalar pitch öncesi referans olarak kullanır, basın doğrudan alıntılar.
        </p>

        <div className="space-y-3">
          {REPORTS.length === 0 ? (
            <Card>
              <p className="text-sm text-dark-400 text-center py-6">
                Henüz yayınlanmış rapor yok.
              </p>
            </Card>
          ) : (
            REPORTS.map((r) => (
              <Link key={r.slug} to={`/reports/${r.slug}`}>
                <Card className="hover:border-neon-500/40 transition-colors cursor-pointer">
                  <div className="flex items-start gap-4">
                    <FileText size={20} className="text-neon-500 shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-dark-400 mb-1">{r.period}</p>
                      <h3 className="text-base font-semibold text-white mb-2">
                        {r.title}
                      </h3>
                      <p className="text-sm text-dark-300 leading-relaxed">
                        {r.summary}
                      </p>
                      <p className="text-[10px] text-dark-500 mt-2">
                        Yayın tarihi: {r.publishedAt}
                      </p>
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-dark-500 shrink-0 mt-1.5"
                    />
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            to="/stats"
            className="flex items-center justify-between p-4 bg-dark-800/50 border border-dark-700 rounded-xl hover:border-neon-500/40 transition-colors"
          >
            <span className="text-sm text-white">Canlı public stats</span>
            <ArrowRight size={14} className="text-dark-400" />
          </Link>
          <Link
            to="/privacy"
            className="flex items-center justify-between p-4 bg-dark-800/50 border border-dark-700 rounded-xl hover:border-accent-cyan/40 transition-colors"
          >
            <span className="text-sm text-white">Gizlilik politikası</span>
            <ArrowRight size={14} className="text-dark-400" />
          </Link>
        </div>

        <div className="mt-12 text-center text-xs text-dark-500">
          <Link to="/" className="hover:text-dark-300">
            havesmashed.com
          </Link>
        </div>
      </div>
    </div>
  );
}
