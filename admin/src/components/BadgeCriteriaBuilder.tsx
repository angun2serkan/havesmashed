// Sponsored badge zengin kriter builder'ı.
//
// Modal içinde collapsible bir panel olarak kullanılır. Tüm condition'lar
// AND ile birleşir; "+ Koşul ekle" 4 condition tipinden birini ekler:
//   - count: filtreli date sayısı min eşiği
//   - distinct: country_code / city_id distinct sayısı eşiği
//   - avg_rating: bir rating alanının ortalaması (min sample + min avg)
//   - friend_count: arkadaş sayısı eşiği
//
// Her condition kendi DateFilter alt panelini taşır (collapsible). Filter
// alanları date formunda toplanan her şeyi kapsar: gender / age_range /
// height_range / country_code / city_id / min_rating ve face/body/chat /
// any_tags / date_after-before.

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  adminApi,
  type BadgeCondition,
  type BadgeCriteria,
  type BadgeDateFilter,
} from '@/services/api'

const AGE_RANGES = [
  '18-22',
  '23-27',
  '28-32',
  '33-37',
  '38-42',
  '43+',
] as const

const HEIGHT_RANGES = [
  '-150',
  '150-160',
  '160-165',
  '165-170',
  '170-175',
  '175-180',
  '180-185',
  '185-190',
  '190-195',
  '195-200',
  '200+',
] as const

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
] as const

const TAG_CATEGORY_LABELS: Record<string, string> = {
  meeting: 'Tanışma',
  venue: 'Mekan',
  activity: 'Aktivite',
  face: 'Yüz',
  physical_female: 'Fiziksel (kadın)',
  physical_male: 'Fiziksel (erkek)',
  personality: 'Karakter',
}

type Tag = { id: number; name: string; category: string }

type CondType = 'count' | 'distinct' | 'avg_rating' | 'friend_count'

const COND_TYPE_LABELS: Record<CondType, string> = {
  count: 'Date sayısı',
  distinct: 'Distinct alan sayısı',
  avg_rating: 'Ortalama rating',
  friend_count: 'Arkadaş sayısı',
}

function newCondition(type: CondType): BadgeCondition {
  switch (type) {
    case 'count':
      return { type: 'count', min: 10, filter: {} }
    case 'distinct':
      return { type: 'distinct', field: 'country_code', min: 3, filter: {} }
    case 'avg_rating':
      return {
        type: 'avg_rating',
        field: 'rating',
        min_avg: 7,
        min_sample: 5,
        filter: {},
      }
    case 'friend_count':
      return { type: 'friend_count', min: 5 }
  }
}

export function BadgeCriteriaBuilder({
  value,
  onChange,
}: {
  value: BadgeCriteria | null
  onChange: (next: BadgeCriteria | null) => void
}) {
  const [open, setOpen] = useState(value != null && value.conditions.length > 0)
  const [adding, setAdding] = useState<CondType>('count')
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    adminApi
      .getTags()
      .then((rows) => setTags(rows.map((r) => ({ id: r.id, name: r.name, category: r.category }))))
      .catch(() => setTags([]))
  }, [])

  const conditions = value?.conditions ?? []

  function update(next: BadgeCondition[]) {
    onChange(next.length === 0 ? null : { conditions: next })
  }

  function addCondition() {
    update([...conditions, newCondition(adding)])
    setOpen(true)
  }

  function removeAt(i: number) {
    update(conditions.filter((_, idx) => idx !== i))
  }

  function patchAt(i: number, patch: BadgeCondition) {
    update(conditions.map((c, idx) => (idx === i ? patch : c)))
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 hover:bg-dark-750"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-dark-400" />
          ) : (
            <ChevronRight size={14} className="text-dark-400" />
          )}
          <span className="text-xs font-medium text-dark-300">
            Özel kriterler (opsiyonel)
          </span>
          {conditions.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neon-500/15 text-neon-400">
              {conditions.length} koşul
            </span>
          )}
        </div>
        <span className="text-[10px] text-dark-500">
          {conditions.length === 0
            ? 'Eklemezseniz legacy category/threshold kullanılır'
            : 'Tüm koşullar AND ile birleşir'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-dark-700">
          {conditions.map((c, i) => (
            <ConditionCard
              key={i}
              cond={c}
              tags={tags}
              onChange={(next) => patchAt(i, next)}
              onRemove={() => removeAt(i)}
            />
          ))}

          <div className="flex items-center gap-2 pt-1">
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value as CondType)}
              className="bg-dark-900 border border-dark-600 rounded-lg px-2 py-1.5 text-xs"
            >
              {(Object.keys(COND_TYPE_LABELS) as CondType[]).map((k) => (
                <option key={k} value={k}>
                  {COND_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addCondition}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-neon-500/15 border border-neon-500/30 text-neon-400 hover:bg-neon-500/25"
            >
              <Plus size={12} /> Koşul ekle
            </button>
          </div>

          {conditions.length === 0 && (
            <p className="text-[11px] text-dark-500 italic">
              Henüz koşul eklenmedi. Koşul eklemezseniz badge, seçtiğiniz
              category + threshold (legacy mantık) ile değerlendirilir.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ConditionCard({
  cond,
  tags,
  onChange,
  onRemove,
}: {
  cond: BadgeCondition
  tags: Tag[]
  onChange: (next: BadgeCondition) => void
  onRemove: () => void
}) {
  const summary = useMemo(() => summarize(cond), [cond])

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-dark-700 text-dark-300 font-mono">
            {COND_TYPE_LABELS[cond.type]}
          </span>
          <span className="text-[11px] text-dark-400 truncate">{summary}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-dark-500 hover:text-red-400"
          title="Koşulu sil"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Type-specific params */}
      <CondParams cond={cond} onChange={onChange} />

      {/* DateFilter (count, distinct, avg_rating taşır; friend_count taşımaz) */}
      {cond.type !== 'friend_count' && (
        <DateFilterPanel
          value={cond.filter ?? {}}
          tags={tags}
          onChange={(next) => onChange({ ...cond, filter: next } as BadgeCondition)}
        />
      )}
    </div>
  )
}

function CondParams({
  cond,
  onChange,
}: {
  cond: BadgeCondition
  onChange: (next: BadgeCondition) => void
}) {
  switch (cond.type) {
    case 'count':
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-dark-400">En az</span>
          <input
            type="number"
            min={1}
            value={cond.min}
            onChange={(e) =>
              onChange({ ...cond, min: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 font-mono"
          />
          <span className="text-dark-400">date</span>
        </div>
      )
    case 'distinct':
      return (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-dark-400">En az</span>
          <input
            type="number"
            min={1}
            value={cond.min}
            onChange={(e) =>
              onChange({ ...cond, min: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 font-mono"
          />
          <span className="text-dark-400">farklı</span>
          <select
            value={cond.field}
            onChange={(e) =>
              onChange({
                ...cond,
                field: e.target.value as 'country_code' | 'city_id',
              })
            }
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs"
          >
            <option value="country_code">ülke</option>
            <option value="city_id">şehir</option>
          </select>
        </div>
      )
    case 'avg_rating':
      return (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <select
            value={cond.field}
            onChange={(e) =>
              onChange({
                ...cond,
                field: e.target.value as typeof cond.field,
              })
            }
            className="bg-dark-800 border border-dark-600 rounded px-2 py-1"
          >
            <option value="rating">Genel rating</option>
            <option value="face_rating">Yüz rating</option>
            <option value="body_rating">Vücut rating</option>
            <option value="chat_rating">Sohbet rating</option>
          </select>
          <span className="text-dark-400">ortalaması ≥</span>
          <input
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={cond.min_avg}
            onChange={(e) =>
              onChange({ ...cond, min_avg: parseFloat(e.target.value) || 0 })
            }
            className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 font-mono"
          />
          <span className="text-dark-400">· min örneklem</span>
          <input
            type="number"
            min={1}
            value={cond.min_sample}
            onChange={(e) =>
              onChange({
                ...cond,
                min_sample: parseInt(e.target.value, 10) || 0,
              })
            }
            className="w-16 bg-dark-800 border border-dark-600 rounded px-2 py-1 font-mono"
          />
        </div>
      )
    case 'friend_count':
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-dark-400">En az</span>
          <input
            type="number"
            min={1}
            value={cond.min}
            onChange={(e) =>
              onChange({ ...cond, min: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 font-mono"
          />
          <span className="text-dark-400">arkadaş</span>
        </div>
      )
  }
}

function DateFilterPanel({
  value,
  tags,
  onChange,
}: {
  value: BadgeDateFilter
  tags: Tag[]
  onChange: (next: BadgeDateFilter) => void
}) {
  const [open, setOpen] = useState(hasAnyFilterField(value))

  function patch(p: Partial<BadgeDateFilter>) {
    onChange({ ...value, ...p })
  }

  function toggleInArr<T>(arr: T[] | undefined, item: T): T[] | undefined {
    const cur = new Set(arr ?? [])
    if (cur.has(item)) cur.delete(item)
    else cur.add(item)
    const next = Array.from(cur)
    return next.length === 0 ? undefined : next
  }

  return (
    <div className="bg-dark-850 border border-dark-700 rounded">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-dark-400 hover:text-dark-200"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Date filtresi
        </span>
        <span className="text-[10px] text-dark-500">
          {hasAnyFilterField(value) ? 'aktif' : 'tüm date\'ler'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-dark-700">
          {/* Gender */}
          <FilterRow label="Gender">
            {GENDERS.map((g) => (
              <Chip
                key={g.value}
                selected={(value.gender ?? []).includes(g.value)}
                onClick={() =>
                  patch({ gender: toggleInArr(value.gender, g.value) })
                }
              >
                {g.label}
              </Chip>
            ))}
          </FilterRow>

          {/* Age range */}
          <FilterRow label="Yaş aralığı">
            {AGE_RANGES.map((a) => (
              <Chip
                key={a}
                selected={(value.age_range ?? []).includes(a)}
                onClick={() => patch({ age_range: toggleInArr(value.age_range, a) })}
              >
                {a}
              </Chip>
            ))}
          </FilterRow>

          {/* Height range */}
          <FilterRow label="Boy">
            {HEIGHT_RANGES.map((h) => (
              <Chip
                key={h}
                selected={(value.height_range ?? []).includes(h)}
                onClick={() =>
                  patch({ height_range: toggleInArr(value.height_range, h) })
                }
              >
                {h}
              </Chip>
            ))}
          </FilterRow>

          {/* Country codes (2-char ISO, virgülle ayır) */}
          <FilterRow label="Ülkeler (2-char ISO, virgülle)">
            <input
              type="text"
              value={(value.country_code ?? []).join(', ')}
              onChange={(e) => {
                const codes = e.target.value
                  .split(',')
                  .map((s) => s.trim().toUpperCase())
                  .filter((s) => s.length === 2)
                patch({ country_code: codes.length > 0 ? codes : undefined })
              }}
              placeholder="TR, US, DE"
              className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs font-mono"
            />
          </FilterRow>

          {/* Min ratings */}
          <div className="grid grid-cols-2 gap-2">
            <MinRatingInput
              label="Min rating"
              value={value.min_rating}
              onChange={(v) => patch({ min_rating: v })}
            />
            <MinRatingInput
              label="Min yüz rating"
              value={value.min_face_rating}
              onChange={(v) => patch({ min_face_rating: v })}
            />
            <MinRatingInput
              label="Min vücut rating"
              value={value.min_body_rating}
              onChange={(v) => patch({ min_body_rating: v })}
            />
            <MinRatingInput
              label="Min sohbet rating"
              value={value.min_chat_rating}
              onChange={(v) => patch({ min_chat_rating: v })}
            />
          </div>

          {/* Tags */}
          <TagPicker
            value={value.any_tags ?? []}
            tags={tags}
            onChange={(ids) =>
              patch({ any_tags: ids.length > 0 ? ids : undefined })
            }
          />

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <FilterRow label="Date'ten itibaren">
              <input
                type="date"
                value={value.date_after ?? ''}
                onChange={(e) =>
                  patch({ date_after: e.target.value || undefined })
                }
                className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs scheme-dark"
              />
            </FilterRow>
            <FilterRow label="Date'e kadar">
              <input
                type="date"
                value={value.date_before ?? ''}
                onChange={(e) =>
                  patch({ date_before: e.target.value || undefined })
                }
                className="w-full bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs scheme-dark"
              />
            </FilterRow>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] rounded-full px-2.5 py-0.5 border ${
        selected
          ? 'bg-neon-500/15 text-neon-300 border-neon-500/30'
          : 'bg-dark-700 text-dark-400 border-dark-600'
      }`}
    >
      {children}
    </button>
  )
}

function MinRatingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <FilterRow label={label}>
      <input
        type="number"
        min={1}
        max={10}
        value={value ?? ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          onChange(Number.isFinite(n) && n >= 1 && n <= 10 ? n : undefined)
        }}
        placeholder="—"
        className="w-20 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs font-mono"
      />
    </FilterRow>
  )
}

function TagPicker({
  value,
  tags,
  onChange,
}: {
  value: number[]
  tags: Tag[]
  onChange: (ids: number[]) => void
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const grouped = useMemo(() => {
    const g: Record<string, Tag[]> = {}
    for (const t of tags) {
      if (!g[t.category]) g[t.category] = []
      g[t.category]!.push(t)
    }
    return g
  }, [tags])

  function toggle(id: number) {
    const set = new Set(value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange(Array.from(set))
  }

  const selectedTags = tags.filter((t) => value.includes(t.id))

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-1.5">
        Tag'ler (en az birinin date'te bulunması)
      </div>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedTags.map((t) => (
            <span
              key={t.id}
              className="text-[10px] bg-neon-500/15 text-neon-300 border border-neon-500/30 rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            >
              {t.name}
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="hover:text-red-400 text-[10px]"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {Object.keys(grouped).map((cat) => {
          const isOpen = openCategory === cat
          return (
            <div key={cat} className="bg-dark-900 border border-dark-700 rounded">
              <button
                type="button"
                onClick={() => setOpenCategory(isOpen ? null : cat)}
                className="w-full flex items-center justify-between px-2 py-1 text-[10px] text-dark-400 hover:text-dark-200"
              >
                <span className="flex items-center gap-1">
                  {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {TAG_CATEGORY_LABELS[cat] ?? cat}
                </span>
                <span className="text-dark-500">{grouped[cat]?.length ?? 0}</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-1 p-2 border-t border-dark-700">
                  {grouped[cat]?.map((t) => (
                    <Chip
                      key={t.id}
                      selected={value.includes(t.id)}
                      onClick={() => toggle(t.id)}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function hasAnyFilterField(f: BadgeDateFilter): boolean {
  return Boolean(
    (f.gender && f.gender.length > 0) ||
      (f.age_range && f.age_range.length > 0) ||
      (f.height_range && f.height_range.length > 0) ||
      (f.country_code && f.country_code.length > 0) ||
      (f.city_id && f.city_id.length > 0) ||
      f.min_rating ||
      f.min_face_rating ||
      f.min_body_rating ||
      f.min_chat_rating ||
      (f.any_tags && f.any_tags.length > 0) ||
      f.date_after ||
      f.date_before,
  )
}

function summarize(c: BadgeCondition): string {
  switch (c.type) {
    case 'count':
      return `min ${c.min} date · ${filterSummary(c.filter)}`
    case 'distinct':
      return `min ${c.min} farklı ${c.field === 'country_code' ? 'ülke' : 'şehir'}`
    case 'avg_rating':
      return `${c.field} ort ≥ ${c.min_avg} (min ${c.min_sample} örneklem)`
    case 'friend_count':
      return `min ${c.min} arkadaş`
  }
}

function filterSummary(f: BadgeDateFilter | undefined): string {
  if (!f || !hasAnyFilterField(f)) return 'tüm date\'ler'
  const parts: string[] = []
  if (f.gender && f.gender.length > 0) parts.push(f.gender.join('/'))
  if (f.age_range && f.age_range.length > 0) parts.push(f.age_range.join(','))
  if (f.country_code && f.country_code.length > 0)
    parts.push(f.country_code.join(','))
  if (f.any_tags && f.any_tags.length > 0)
    parts.push(`${f.any_tags.length} tag`)
  if (f.min_rating) parts.push(`r≥${f.min_rating}`)
  return parts.join(' · ') || 'filtreli'
}
