import type { CampaignStatus } from '@/services/api'

interface Props {
  status: CampaignStatus
  pausedReason?: string | null
}

const STATUS_STYLES: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  draft: {
    bg: 'bg-dark-700',
    text: 'text-dark-300',
    label: 'draft',
  },
  pending_review: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    label: 'inceleme',
  },
  active: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    label: 'aktif',
  },
  paused: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-300',
    label: 'duraklı',
  },
  rejected: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    label: 'red',
  },
}

export default function StatusBadge({ status, pausedReason }: Props) {
  const s = STATUS_STYLES[status]
  const budgetExhausted = status === 'paused' && pausedReason === 'budget_exhausted'

  if (budgetExhausted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-purple-500/20 text-purple-300">
        🟠 bütçe doldu
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  )
}
