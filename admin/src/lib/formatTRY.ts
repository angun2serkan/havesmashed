// 100 TL katı para formatı. Storage kuruş cinsinden bigint/number;
// gösterim integer TL (ondalık yok, tr-TR locale).

const TR = new Intl.NumberFormat('tr-TR')

/**
 * `formatTRY(50000)` → `"500 TL"`.
 *
 * Backend her tutarı 100 TL'nin tam katı tutar (CHECK constraint + body
 * validation). Yine de yuvarlama gerekirse aşağı yuvarlanır — yanlış
 * giriş yok varsayımıyla bu yol asla tetiklenmemeli.
 */
export function formatTRY(cents: number | bigint | null | undefined): string {
  if (cents == null) return '—'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  const lira = Math.trunc(n / 100)
  return `${TR.format(lira)} TL`
}

/**
 * Sıralı tutar (tx tablosu için): işareti + renk hint'i döner.
 */
export function formatTRYSigned(cents: number | bigint | null | undefined): {
  text: string
  sign: '+' | '-' | ''
} {
  if (cents == null) return { text: '—', sign: '' }
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  if (n > 0) return { text: `+${formatTRY(n)}`, sign: '+' }
  if (n < 0) return { text: `-${formatTRY(-n)}`, sign: '-' }
  return { text: formatTRY(0), sign: '' }
}
