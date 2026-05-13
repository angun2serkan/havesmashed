import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import {
  brandStatsApi,
  type BrandStatsSummary,
} from '@/services/api'
import { effectiveBrandId, useAdminStore } from '@/stores/adminStore'
import StatusBadge from '@/components/StatusBadge'
import BudgetProgressBar from '@/components/BudgetProgressBar'

export default function BrandPortalDashboard() {
  const me = useAdminStore((s) => s.me)
  const brandId = effectiveBrandId(me)
  const [summary, setSummary] = useState<BrandStatsSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!brandId) return
    setSummary(null)
    brandStatsApi
      .summary(brandId, 30)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }, [brandId])

  if (!brandId) {
    return (
      <div className="text-dark-400">
        Brand kapsamı bulunamadı. Super_admin lütfen "Brand olarak davran" ile bir
        brand seçin.
      </div>
    )
  }

  const exhaustedCampaigns = summary?.per_campaign.filter(
    (c) => c.paused_reason === 'budget_exhausted',
  )

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="text-neon-500" />
            {me?.brand?.display_name ?? me?.impersonating_brand?.display_name ?? 'Brand Portal'}
          </h1>
          <p className="text-dark-400 text-sm mt-1">Son 30 günün özeti.</p>
        </div>
        <Link
          to="/ads/campaigns"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-500/20 hover:bg-neon-500/30 text-neon-400 border border-neon-500/30 text-sm font-medium"
        >
          <Plus size={16} /> Yeni Kampanya
        </Link>
      </header>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {summary === null ? (
        <div className="text-dark-400 text-sm">Yükleniyor…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KpiCard label="Impressions (30g)" value={summary.totals.impressions.toLocaleString()} />
            <KpiCard label="Clicks (30g)" value={summary.totals.clicks.toLocaleString()} />
            <KpiCard
              label="CTR"
              value={`%${(summary.totals.ctr * 100).toFixed(2)}`}
            />
          </div>

          {/* Budget section */}
          <section className="bg-dark-900 border border-dark-700 rounded-lg p-5 mb-6">
            <h2 className="font-semibold text-white mb-3">Bu Ay Harcama</h2>
            {summary.budget.total_budget_cents > 0 ? (
              <>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-3xl font-bold text-white">
                      ₺{(summary.budget.total_spent_cents / 100).toLocaleString()}
                    </div>
                    <div className="text-xs text-dark-400">
                      / ₺{(summary.budget.total_budget_cents / 100).toLocaleString()} toplam bütçe
                    </div>
                  </div>
                  {summary.budget.overall_progress_percent !== null && (
                    <div className="text-2xl text-neon-400 tabular-nums">
                      %{summary.budget.overall_progress_percent.toFixed(1)}
                    </div>
                  )}
                </div>
                <BudgetProgressBar
                  spentCents={summary.budget.total_spent_cents}
                  totalBudgetCents={summary.budget.total_budget_cents}
                  pausedReason={null}
                  pricingModel="cpm"
                />
                {summary.budget.campaigns_paused_due_to_budget > 0 && (
                  <div className="mt-3 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded text-purple-300 text-sm">
                    {summary.budget.campaigns_paused_due_to_budget} kampanya bütçe
                    aşımı nedeniyle duraklatıldı.
                  </div>
                )}
              </>
            ) : (
              <p className="text-dark-400 text-sm">
                Henüz bütçe takibi yapılan kampanya yok (flat-fee veya pricing
                modeli henüz ayarlanmamış).
              </p>
            )}
          </section>

          {/* Exhausted campaigns */}
          {exhaustedCampaigns && exhaustedCampaigns.length > 0 && (
            <section className="bg-dark-900 border border-purple-500/30 rounded-lg p-5 mb-6">
              <h2 className="font-semibold text-purple-300 mb-3">
                Bütçesi Dolan Kampanyalar
              </h2>
              <ul className="space-y-2">
                {exhaustedCampaigns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <Link
                      to={`/ads/campaigns/${c.id}`}
                      className="text-sm text-white hover:text-neon-400"
                    >
                      {c.name}
                    </Link>
                    <span className="text-xs text-purple-300">
                      ₺{(c.spent_cents / 100).toLocaleString()} / ₺{((c.total_budget_cents ?? 0) / 100).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Campaign list */}
          <section className="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <h2 className="font-semibold text-white">Kampanyalarım</h2>
              <Link to="/ads/campaigns" className="text-xs text-neon-500 hover:text-neon-400">
                Hepsini gör →
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-dark-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Kampanya</th>
                  <th className="text-left px-4 py-2">Durum</th>
                  <th className="text-left px-4 py-2">Bütçe</th>
                </tr>
              </thead>
              <tbody>
                {summary.per_campaign.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-dark-400">
                      Henüz kampanya yok.
                    </td>
                  </tr>
                )}
                {summary.per_campaign.map((c) => (
                  <tr key={c.id} className="border-t border-dark-800">
                    <td className="px-4 py-2">
                      <Link
                        to={`/ads/campaigns/${c.id}`}
                        className="text-white hover:text-neon-400"
                      >
                        {c.name}
                      </Link>
                      <div className="text-[11px] text-dark-500">
                        {c.placement_key}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        status={c.status as never}
                        pausedReason={c.paused_reason}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <BudgetProgressBar
                        spentCents={c.spent_cents}
                        totalBudgetCents={c.total_budget_cents}
                        pausedReason={c.paused_reason}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {summary.affiliate_clicks_total > 0 && (
            <div className="mt-6 text-sm text-dark-300">
              Affiliate slug'larınız son 30 günde{' '}
              <strong>{summary.affiliate_clicks_total.toLocaleString()}</strong> click
              aldı.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-lg p-4">
      <div className="text-xs text-dark-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
    </div>
  )
}
