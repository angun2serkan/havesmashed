import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Pause,
  Pencil,
  Trash2,
  Copy,
  Megaphone,
  AlertTriangle,
  BarChart3,
  Send,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import {
  adminApi,
  brandsApi,
  type Brand,
  type Campaign,
  type Placement,
} from '@/services/api'
import { CampaignEditorModal } from '@/components/CampaignEditorModal'
import StatusBadge from '@/components/StatusBadge'
import BudgetProgressBar from '@/components/BudgetProgressBar'
import { effectiveRole, useAdminStore } from '@/stores/adminStore'

type StatusFilter =
  | 'all'
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'scheduled'
  | 'expired'
  | 'dry_run'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Hepsi',
  draft: 'Taslak',
  pending_review: 'İncelemede',
  active: 'Aktif',
  paused: 'Duraklı',
  rejected: 'Red',
  scheduled: 'Zamanlanmış',
  expired: 'Süresi dolmuş',
  dry_run: 'Dry run',
}

export default function AdCampaignsPage() {
  const me = useAdminStore((s) => s.me)
  const role = effectiveRole(me)
  const isSuper = role === 'super_admin'

  const [items, setItems] = useState<Campaign[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const [status, setStatus] = useState<StatusFilter>('all')
  const [placementFilter, setPlacementFilter] = useState<string>('')
  const [brandFilter, setBrandFilter] = useState<string>('')
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const placementByKey = useMemo(() => {
    const m: Record<string, Placement> = {}
    for (const p of placements) m[p.key] = p
    return m
  }, [placements])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [cs, ps] = await Promise.all([
        adminApi.listCampaigns({
          status,
          placement_key: placementFilter || undefined,
          brand_id: brandFilter || undefined,
          include_deleted: includeDeleted,
        }),
        placements.length === 0
          ? adminApi.listPlacements()
          : Promise.resolve(placements),
      ])
      setItems(cs)
      if (placements.length === 0) setPlacements(ps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  // Brand listesi (super filter dropdown)
  useEffect(() => {
    if (isSuper) {
      brandsApi.list(false).then(setBrands).catch(() => setBrands([]))
    }
  }, [isSuper])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, placementFilter, brandFilter, includeDeleted])

  async function callAction(
    id: string,
    label: string,
    fn: () => Promise<unknown>,
  ) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(
        e instanceof Error ? `${label} başarısız: ${e.message}` : `${label} başarısız`,
      )
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = (c: Campaign) =>
    callAction(c.id, 'Silme', () => adminApi.deleteCampaign(c.id)).then(() =>
      setConfirmDelete(null),
    )

  // Duplicate flow
  const [duplicateSource, setDuplicateSource] = useState<Campaign | null>(null)
  const handleDuplicate = (c: Campaign) => {
    setEditing(null)
    setCreating(false)
    setDuplicateSource(c)
  }

  const onSaved = async () => {
    setEditing(null)
    setCreating(false)
    setDuplicateSource(null)
    await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone size={22} className="text-neon-500" />
            Reklam Kampanyaları
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            {isSuper
              ? 'Approve / reject / pause / restore — her şey audit log\'a yazılır.'
              : 'Brand panelinden kampanyalarınızı yönetin.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm hover:bg-dark-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-neon-500/20 text-neon-400 border border-neon-500/30 rounded-lg text-sm font-medium hover:bg-neon-500/30"
          >
            <Plus size={14} />
            Yeni kampanya
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-dark-900 border border-dark-700 rounded-lg p-0.5 flex-wrap">
          {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-xs px-2.5 py-1 rounded ${
                status === s
                  ? 'bg-neon-500/20 text-neon-400'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <select
          value={placementFilter}
          onChange={(e) => setPlacementFilter(e.target.value)}
          className="bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Tüm placement'lar</option>
          {placements.map((p) => (
            <option key={p.key} value={p.key}>
              {p.display_name}
            </option>
          ))}
        </select>
        {isSuper && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-dark-900 border border-dark-700 rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">Tüm brand'ler</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.display_name}
              </option>
            ))}
          </select>
        )}
        {isSuper && (
          <label className="flex items-center gap-1.5 text-xs text-dark-300 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="accent-neon-500"
            />
            Silinmiş kampanyaları göster
          </label>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-dark-400 text-[11px] uppercase border-b border-dark-700">
                <th className="text-left py-2.5 px-3 font-medium">Brand</th>
                <th className="text-left py-2.5 px-3 font-medium">Placement</th>
                <th className="text-left py-2.5 px-3 font-medium">Durum</th>
                <th className="text-right py-2.5 px-3 font-medium">Impressions</th>
                <th className="text-right py-2.5 px-3 font-medium">Clicks</th>
                <th className="text-left py-2.5 px-3 font-medium">Bütçe</th>
                <th className="text-left py-2.5 px-3 font-medium">Tarih</th>
                <th className="text-right py-2.5 px-3 font-medium">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-sm text-dark-400"
                  >
                    Bu filtrelerde kampanya yok.
                  </td>
                </tr>
              )}
              {items.map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  placement={placementByKey[c.placement_key]}
                  isSuper={isSuper}
                  busy={busyId === c.id}
                  onAction={(action) => {
                    switch (action) {
                      case 'submit':
                        return callAction(c.id, 'Submit', () =>
                          adminApi.submitForReview(c.id),
                        )
                      case 'approve':
                        if (!confirm('Onayla ve yayına al?')) return
                        return callAction(c.id, 'Onay', () =>
                          adminApi.approveCampaign(c.id),
                        )
                      case 'pause':
                        return callAction(c.id, 'Pause', () =>
                          adminApi.pauseCampaign(c.id),
                        )
                      case 'resume':
                        return callAction(c.id, 'Resume', () =>
                          adminApi.resumeCampaign(c.id),
                        )
                      case 'restore':
                        return callAction(c.id, 'Restore', () =>
                          adminApi.restoreCampaign(c.id),
                        )
                      case 'reject':
                        return setRejectingId(c.id)
                      case 'edit':
                        return setEditing(c)
                      case 'duplicate':
                        return handleDuplicate(c)
                      case 'delete':
                        return setConfirmDelete(c)
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <CampaignEditorModal
          initial={editing}
          placements={placements}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {creating && !duplicateSource && (
        <CampaignEditorModal
          initial={null}
          placements={placements}
          onClose={() => setCreating(false)}
          onSaved={onSaved}
        />
      )}
      {duplicateSource && (
        <CampaignEditorModal
          initial={{ ...duplicateSource, id: '' as string }}
          placements={placements}
          onClose={() => {
            setDuplicateSource(null)
            setCreating(false)
          }}
          onSaved={onSaved}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          campaign={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
          busy={busyId === confirmDelete.id}
        />
      )}

      {/* Reject modal */}
      {rejectingId && (
        <RejectModal
          onClose={() => setRejectingId(null)}
          onSubmit={async (reason) => {
            await callAction(rejectingId, 'Reddet', () =>
              adminApi.rejectCampaign(rejectingId, reason),
            )
            setRejectingId(null)
          }}
        />
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

type RowAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'pause'
  | 'resume'
  | 'restore'
  | 'edit'
  | 'duplicate'
  | 'delete'

function CampaignRow({
  c,
  placement,
  isSuper,
  busy,
  onAction,
}: {
  c: Campaign
  placement?: Placement
  isSuper: boolean
  busy: boolean
  onAction: (a: RowAction) => void
}) {
  const start = new Date(c.starts_at).toISOString().slice(0, 10)
  const end = new Date(c.ends_at).toISOString().slice(0, 10)
  const isDeleted = c.deleted_at !== null

  return (
    <tr
      className={`border-b border-dark-700/50 hover:bg-dark-700/20 ${
        isDeleted ? 'opacity-50' : ''
      }`}
    >
      <td className="py-2.5 px-3">
        <Link
          to={`/ads/campaigns/${c.id}`}
          className="font-medium text-white hover:text-neon-400 transition-colors"
        >
          {c.brand_name}
        </Link>
        {c.is_dry_run && (
          <div className="text-[10px] text-yellow-400 inline-flex items-center gap-1 mt-0.5">
            <AlertTriangle size={10} /> dry run
          </div>
        )}
        {isDeleted && (
          <div className="text-[10px] text-red-400 mt-0.5">silinmiş</div>
        )}
      </td>
      <td className="py-2.5 px-3">
        <div className="text-dark-200">
          {placement?.display_name ?? c.placement_key}
        </div>
        {placement && !placement.is_globally_enabled && (
          <div className="text-[10px] text-yellow-400">placement KAPALI</div>
        )}
      </td>
      <td className="py-2.5 px-3">
        <StatusBadge status={c.status} pausedReason={c.paused_reason} />
      </td>
      <td className="py-2.5 px-3 text-right text-dark-100 font-mono">
        {c.impressions_total.toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-right text-dark-100 font-mono">
        {c.clicks_total.toLocaleString()}
      </td>
      <td className="py-2.5 px-3">
        <BudgetProgressBar
          spentCents={c.spent_cents}
          totalBudgetCents={c.total_budget_cents}
          pausedReason={c.paused_reason}
          pricingModel={c.pricing_model}
        />
      </td>
      <td className="py-2.5 px-3 text-dark-300 text-xs">
        {start} → {end}
      </td>
      <td className="py-2.5 px-3">
        <RowActions
          c={c}
          isSuper={isSuper}
          busy={busy}
          onAction={onAction}
        />
      </td>
    </tr>
  )
}

function RowActions({
  c,
  isSuper,
  busy,
  onAction,
}: {
  c: Campaign
  isSuper: boolean
  busy: boolean
  onAction: (a: RowAction) => void
}) {
  const isDeleted = c.deleted_at !== null
  const budgetExhausted = c.paused_reason === 'budget_exhausted'

  // Restore is available only for soft-deleted campaigns (super only).
  if (isDeleted) {
    return (
      <div className="flex items-center justify-end gap-1">
        {isSuper && (
          <IconBtn title="Geri yükle" onClick={() => onAction('restore')} disabled={busy}>
            <Undo2 size={13} />
          </IconBtn>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1 flex-wrap">
      <Link
        to={`/ads/campaigns/${c.id}`}
        title="Detay"
        className="p-1.5 rounded bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-neon-400 transition-colors inline-flex"
      >
        <BarChart3 size={13} />
      </Link>

      {/* Submit-for-review */}
      {(c.status === 'draft' || c.status === 'rejected') && (
        <IconBtn
          title="İncelemeye gönder"
          onClick={() => onAction('submit')}
          disabled={busy}
        >
          <Send size={13} />
        </IconBtn>
      )}

      {/* Approve/Reject — super on pending_review */}
      {isSuper && c.status === 'pending_review' && (
        <>
          <button
            title="Onayla"
            onClick={() => onAction('approve')}
            disabled={busy}
            className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs disabled:opacity-40"
          >
            ✓
          </button>
          <button
            title="Reddet"
            onClick={() => onAction('reject')}
            disabled={busy}
            className="px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs disabled:opacity-40"
          >
            ✗
          </button>
        </>
      )}

      {/* Pause — active campaigns */}
      {c.status === 'active' && (
        <IconBtn title="Duraklat" onClick={() => onAction('pause')} disabled={busy}>
          <Pause size={13} />
        </IconBtn>
      )}

      {/* Resume — paused campaigns (gated when budget exhausted) */}
      {c.status === 'paused' && (
        <IconBtn
          title={
            budgetExhausted
              ? 'Bütçe artırılmalı (super_admin)'
              : isSuper
                ? 'Devam et'
                : 'Devam et (yeniden incelemeye gider)'
          }
          onClick={() => onAction('resume')}
          disabled={busy || budgetExhausted}
        >
          <RotateCcw size={13} />
        </IconBtn>
      )}

      <IconBtn title="Düzenle" onClick={() => onAction('edit')} disabled={busy}>
        <Pencil size={13} />
      </IconBtn>
      <IconBtn title="Klonla" onClick={() => onAction('duplicate')} disabled={busy}>
        <Copy size={13} />
      </IconBtn>
      <IconBtn
        title="Sil"
        onClick={() => onAction('delete')}
        variant="danger"
        disabled={busy}
      >
        <Trash2 size={13} />
      </IconBtn>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  variant,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  variant?: 'danger'
}) {
  const base =
    'p-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const cls =
    variant === 'danger'
      ? 'bg-dark-900 border-dark-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/30'
      : 'bg-dark-900 border-dark-700 text-dark-300 hover:text-white hover:bg-dark-700'
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${cls}`}
    >
      {children}
    </button>
  )
}

function DeleteConfirm({
  campaign,
  onCancel,
  onConfirm,
  busy,
}: {
  campaign: Campaign
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}) {
  const isActive = campaign.status === 'active'
  const isHighImpact = isActive || campaign.impressions_total > 0
  const [confirmName, setConfirmName] = useState('')

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-red-900/50 rounded-xl w-full max-w-md p-5">
        <h3 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
          <Trash2 size={18} /> Kampanyayı sil
        </h3>
        <p className="text-sm text-dark-300 mb-3">
          Bu işlem kampanyayı <strong>soft delete</strong> eder: listede
          görünmez, ad serving'de yayına çıkmaz. Süper-admin geri yükleyebilir.
        </p>
        {isHighImpact && (
          <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-xs">
            ⚠ Bu kampanya {campaign.impressions_total.toLocaleString()} impression
            aldı. Devam etmek için ismini yazın:
            <div className="mt-1 font-mono text-amber-200">
              {campaign.brand_name}
            </div>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-full mt-2 px-2 py-1 bg-dark-950 border border-dark-700 rounded text-xs"
              placeholder="Brand ismini yazın"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-200 hover:bg-dark-700"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || (isHighImpact && confirmName !== campaign.brand_name)}
            className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-50"
          >
            {busy ? 'Siliniyor…' : 'Sil'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-xl p-5">
        <h3 className="font-bold text-white mb-2">Kampanyayı Reddet</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Reddedilme sebebi…"
          className="w-full px-3 py-2 bg-dark-950 border border-dark-700 rounded text-sm text-white mb-3"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300">
            İptal
          </button>
          <button
            onClick={() => onSubmit(reason)}
            disabled={!reason.trim()}
            className="px-4 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded text-sm font-medium disabled:opacity-50"
          >
            Reddet
          </button>
        </div>
      </div>
    </div>
  )
}
