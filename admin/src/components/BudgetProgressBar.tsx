interface Props {
  spentCents: number
  totalBudgetCents: number | null
  pausedReason?: string | null
  pricingModel?: 'cpm' | 'cpc' | 'flat' | null
}

/**
 * Visual budget progress with color cascade:
 *   < 80%  → green
 *   80-95% → amber
 *   ≥ 95%  → red
 *   paused_reason=budget_exhausted → purple (solid)
 *
 * For flat pricing or no budget set, renders "—".
 */
export default function BudgetProgressBar({
  spentCents,
  totalBudgetCents,
  pausedReason,
  pricingModel,
}: Props) {
  if (pricingModel === 'flat' || !totalBudgetCents || totalBudgetCents <= 0) {
    return <span className="text-dark-500 text-xs">—</span>
  }

  const progress = Math.min(100, (spentCents / totalBudgetCents) * 100)
  const exhausted = pausedReason === 'budget_exhausted'

  let color: string
  if (exhausted) color = 'bg-purple-500'
  else if (progress >= 95) color = 'bg-red-500'
  else if (progress >= 80) color = 'bg-amber-500'
  else color = 'bg-emerald-500'

  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="flex-1 h-1.5 bg-dark-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[11px] text-dark-400 tabular-nums w-12 text-right shrink-0">
        %{progress.toFixed(0)}
      </span>
    </div>
  )
}
