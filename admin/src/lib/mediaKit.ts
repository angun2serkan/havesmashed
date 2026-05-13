// Media kit export pipeline.
//
// Three formats, single shared snapshot input:
//   - exportMediaKitPdf  → branded multi-page PDF (jsPDF)
//   - exportMediaKitPptx → editable PowerPoint deck (pptxgenjs)
//   - exportSnapshotCsv  → flat CSV bundle (downloads as 2 files)
//
// All formats include the anonymity disclaimer footer/cover and
// honor the same MediaKitOptions (brand name, segment filter, notes).

import jsPDF from 'jspdf'
import PptxGenJS from 'pptxgenjs'

export type SeriesRow = {
  date: string
  total_users: number
  new_users: number
  dau: number
  mau: number
  total_dates_logged: number
  new_dates_logged: number
}

export type SegmentRow = { segment_key: string; segment_value: string; cohort_size: number }

export type Snapshot = {
  as_of: string | null
  series: SeriesRow[]
  segments: SegmentRow[]
  k_threshold: number
}

export type MediaKitOptions = {
  brandName: string | null
  notes: string | null
  segmentKeys: string[] | null
  days: number
}

const SEGMENT_LABELS: Record<string, string> = {
  single_proxy: 'Single Proxy',
  active_dater_30d: 'Active Dater (30d)',
  high_frequency_30d: 'High Frequency Dater (5+/30d)',
  partner_gender_majority: 'Partner Gender Majority',
  partner_age_range: 'Partner Age Range',
  top_city_dates: 'Top Cities (date count)',
  tag_category: 'Tag Category Affinity',
}

const ANONYMITY_NOTE =
  'All figures aggregated; cohorts below k=1000 are suppressed. ' +
  'No user identifiers, hashes, or device IDs are included or shared.'

function fmtNum(n: number) {
  return n.toLocaleString('en-US')
}

function groupSegments(segments: SegmentRow[]) {
  const map: Record<string, SegmentRow[]> = {}
  for (const s of segments) (map[s.segment_key] ??= []).push(s)
  return map
}

function headlineFromSeries(series: SeriesRow[]) {
  const last = series[series.length - 1]
  if (!last) return null
  const ratio = last.mau > 0 ? last.dau / last.mau : 0
  return {
    asOf: last.date,
    totalUsers: last.total_users,
    dau: last.dau,
    mau: last.mau,
    ratio,
    totalDates: last.total_dates_logged,
  }
}

function brandedTitle(opts: MediaKitOptions) {
  return opts.brandName
    ? `havesmashed — Advertiser Pack for ${opts.brandName}`
    : 'havesmashed — Advertiser Pack'
}

// ── PDF ────────────────────────────────────────────────────────

export async function exportMediaKitPdf(snapshot: Snapshot, opts: MediaKitOptions) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48

  const today = new Date().toISOString().slice(0, 10)
  const headline = headlineFromSeries(snapshot.series)
  const grouped = groupSegments(snapshot.segments)

  // ── Cover ──
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setTextColor(34, 197, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(36)
  doc.text('havesmashed', margin, 200)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text(
    opts.brandName ? `Advertiser Pack for ${opts.brandName}` : 'Advertiser Pack',
    margin,
    240,
  )
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Generated: ${today}`, margin, 270)
  if (snapshot.as_of) doc.text(`Data as of: ${snapshot.as_of}`, margin, 286)
  doc.text(`Window: last ${opts.days} days`, margin, 302)
  doc.setFontSize(9)
  doc.text(ANONYMITY_NOTE, margin, pageH - 60, { maxWidth: pageW - 2 * margin })

  // ── Page 2: Privacy contract ──
  doc.addPage()
  pageHeader(doc, brandedTitle(opts), pageW, margin)
  doc.setTextColor(34, 34, 34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Privacy-First by Design', margin, 110)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const bullets = [
    `K-anonymity: every cohort published is ≥ ${snapshot.k_threshold} users.`,
    'No emails, phones, passwords. Auth is BIP39 seed phrase.',
    'No user identifiers, hashes, or device IDs are sold or shared.',
    'No third-party tracking pixels (Meta, Google, TikTok).',
    'No programmatic ad exchange, no DMP integration.',
    'Server-side targeting only. Brand never sees who saw the ad.',
  ]
  let y = 140
  for (const b of bullets) {
    doc.text(`•  ${b}`, margin, y, { maxWidth: pageW - 2 * margin })
    y += 22
  }
  pageFooter(doc, pageW, pageH, margin)

  // ── Page 3: Headline numbers ──
  doc.addPage()
  pageHeader(doc, brandedTitle(opts), pageW, margin)
  doc.setTextColor(34, 34, 34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Headline Reach & Engagement', margin, 110)

  if (headline) {
    drawCard(doc, margin, 140, 220, 90, 'Total Users', fmtNum(headline.totalUsers))
    drawCard(doc, margin + 240, 140, 220, 90, 'MAU (30d)', fmtNum(headline.mau))
    drawCard(doc, margin, 250, 220, 90, 'DAU', fmtNum(headline.dau))
    drawCard(
      doc,
      margin + 240,
      250,
      220,
      90,
      'DAU / MAU',
      `${(headline.ratio * 100).toFixed(1)}%`,
    )
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(
      `Total dates logged (cumulative): ${fmtNum(headline.totalDates)}`,
      margin,
      370,
    )
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(120, 120, 120)
    doc.text('No daily metrics available yet — run /admin/analytics/recompute.', margin, 150)
  }
  pageFooter(doc, pageW, pageH, margin)

  // ── Page 4: Trend table ──
  doc.addPage()
  pageHeader(doc, brandedTitle(opts), pageW, margin)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(34, 34, 34)
  doc.text('Daily Trend (last rows)', margin, 110)
  drawTable(
    doc,
    margin,
    130,
    ['Date', 'DAU', 'MAU', 'New Users', 'New Dates'],
    snapshot.series.slice(-30).map((r) => [
      r.date,
      fmtNum(r.dau),
      fmtNum(r.mau),
      fmtNum(r.new_users),
      fmtNum(r.new_dates_logged),
    ]),
    [120, 80, 80, 90, 90],
  )
  pageFooter(doc, pageW, pageH, margin)

  // ── Pages 5+: Segments grouped ──
  for (const [key, rows] of Object.entries(grouped)) {
    if (opts.segmentKeys && !opts.segmentKeys.includes(key)) continue
    doc.addPage()
    pageHeader(doc, brandedTitle(opts), pageW, margin)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(34, 34, 34)
    doc.text(SEGMENT_LABELS[key] ?? key, margin, 110)
    drawTable(
      doc,
      margin,
      130,
      ['Segment Value', 'Cohort Size'],
      rows.map((r) => [r.segment_value, fmtNum(r.cohort_size)]),
      [320, 140],
    )
    pageFooter(doc, pageW, pageH, margin)
  }

  // ── Notes page ──
  if (opts.notes) {
    doc.addPage()
    pageHeader(doc, brandedTitle(opts), pageW, margin)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(34, 34, 34)
    doc.text('Notes', margin, 110)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(opts.notes, margin, 140, { maxWidth: pageW - 2 * margin })
    pageFooter(doc, pageW, pageH, margin)
  }

  const fname = `havesmashed-mediakit-${opts.brandName ? slugify(opts.brandName) + '-' : ''}${today}.pdf`
  doc.save(fname)
}

function pageHeader(doc: jsPDF, title: string, pageW: number, margin: number) {
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.5)
  doc.line(margin, 70, pageW - margin, 70)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(title, margin, 60)
}

function pageFooter(doc: jsPDF, pageW: number, pageH: number, margin: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(ANONYMITY_NOTE, margin, pageH - 30, { maxWidth: pageW - 2 * margin })
}

function drawCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  doc.setDrawColor(220, 220, 220)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 8, 8, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(label, x + 16, y + 24)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(15, 23, 42)
  doc.text(value, x + 16, y + 60)
}

function drawTable(
  doc: jsPDF,
  x: number,
  y: number,
  headers: string[],
  rows: string[][],
  widths: number[],
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setFillColor(15, 23, 42)
  doc.setTextColor(255, 255, 255)
  let cx = x
  doc.rect(
    x,
    y,
    widths.reduce((a, b) => a + b, 0),
    20,
    'F',
  )
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 8, y + 14)
    cx += widths[i]
  }

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(34, 34, 34)
  doc.setDrawColor(220, 220, 220)

  let cy = y + 20
  const pageH = doc.internal.pageSize.getHeight()
  for (const row of rows) {
    if (cy + 18 > pageH - 60) {
      doc.addPage()
      cy = 80
    }
    cx = x
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], cx + 8, cy + 14)
      cx += widths[i]
    }
    cy += 18
    doc.line(x, cy, x + widths.reduce((a, b) => a + b, 0), cy)
  }
}

// ── PPTX ───────────────────────────────────────────────────────

export async function exportMediaKitPptx(snapshot: Snapshot, opts: MediaKitOptions) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = brandedTitle(opts)

  const today = new Date().toISOString().slice(0, 10)
  const headline = headlineFromSeries(snapshot.series)
  const grouped = groupSegments(snapshot.segments)

  // Cover
  const cover = pptx.addSlide()
  cover.background = { color: '0F172A' }
  cover.addText('havesmashed', {
    x: 0.6,
    y: 1.5,
    w: 12,
    h: 1.2,
    fontSize: 56,
    bold: true,
    color: '22C55E',
    fontFace: 'Helvetica',
  })
  cover.addText(opts.brandName ? `Advertiser Pack for ${opts.brandName}` : 'Advertiser Pack', {
    x: 0.6,
    y: 2.7,
    w: 12,
    h: 0.6,
    fontSize: 28,
    color: 'FFFFFF',
    fontFace: 'Helvetica',
  })
  cover.addText(
    `Generated ${today}${snapshot.as_of ? ` · Data as of ${snapshot.as_of}` : ''} · Window: last ${opts.days}d`,
    {
      x: 0.6,
      y: 3.4,
      w: 12,
      h: 0.4,
      fontSize: 14,
      color: '94A3B8',
    },
  )
  cover.addText(ANONYMITY_NOTE, {
    x: 0.6,
    y: 6.8,
    w: 12,
    h: 0.5,
    fontSize: 10,
    color: '94A3B8',
    italic: true,
  })

  // Privacy
  const privacy = pptx.addSlide()
  privacy.addText('Privacy-First by Design', {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
  })
  privacy.addText(
    [
      `K-anonymity: every cohort published is ≥ ${snapshot.k_threshold} users.`,
      'No emails, phones, passwords. Auth is BIP39 seed phrase.',
      'No user identifiers, hashes, or device IDs are sold or shared.',
      'No third-party tracking pixels (Meta, Google, TikTok).',
      'No programmatic ad exchange, no DMP integration.',
      'Server-side targeting only — brand never sees who saw the ad.',
    ].map((t) => ({ text: t, options: { bullet: true } })),
    { x: 0.5, y: 1.2, w: 12, h: 5, fontSize: 16 },
  )

  // Headline numbers
  if (headline) {
    const head = pptx.addSlide()
    head.addText('Headline Reach & Engagement', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 28,
      bold: true,
    })
    addBigNumber(head, 0.5, 1.5, 'Total Users', fmtNum(headline.totalUsers))
    addBigNumber(head, 4.0, 1.5, 'MAU (30d)', fmtNum(headline.mau))
    addBigNumber(head, 7.5, 1.5, 'DAU', fmtNum(headline.dau))
    addBigNumber(head, 11.0, 1.5, 'DAU / MAU', `${(headline.ratio * 100).toFixed(1)}%`)
    head.addText(`Total dates logged (cumulative): ${fmtNum(headline.totalDates)}`, {
      x: 0.5,
      y: 4.5,
      w: 12,
      h: 0.4,
      fontSize: 14,
      color: '475569',
    })
  }

  // Trend
  const trend = pptx.addSlide()
  trend.addText('Daily Trend', {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
  })
  if (snapshot.series.length) {
    trend.addChart(pptx.ChartType.line, [
      {
        name: 'DAU',
        labels: snapshot.series.map((r) => r.date),
        values: snapshot.series.map((r) => r.dau),
      },
      {
        name: 'MAU',
        labels: snapshot.series.map((r) => r.date),
        values: snapshot.series.map((r) => r.mau),
      },
    ], {
      x: 0.5,
      y: 1.2,
      w: 12,
      h: 5.5,
      chartColors: ['22C55E', '06B6D4'],
      showLegend: true,
      legendPos: 'b',
    })
  }

  // Segments — one slide per group
  for (const [key, rows] of Object.entries(grouped)) {
    if (opts.segmentKeys && !opts.segmentKeys.includes(key)) continue
    const s = pptx.addSlide()
    s.addText(SEGMENT_LABELS[key] ?? key, {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 28,
      bold: true,
    })
    s.addTable(
      [
        [
          { text: 'Segment Value', options: { bold: true, fill: { color: '0F172A' }, color: 'FFFFFF' } },
          { text: 'Cohort Size', options: { bold: true, fill: { color: '0F172A' }, color: 'FFFFFF' } },
        ],
        ...rows.map((r) => [
          { text: r.segment_value },
          { text: fmtNum(r.cohort_size) },
        ]),
      ],
      { x: 0.5, y: 1.2, w: 12, fontSize: 14, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 } },
    )
  }

  // Notes
  if (opts.notes) {
    const n = pptx.addSlide()
    n.addText('Notes', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true })
    n.addText(opts.notes, { x: 0.5, y: 1.2, w: 12, h: 5.5, fontSize: 16 })
  }

  // Contact
  const contact = pptx.addSlide()
  contact.addText('Contact', { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true })
  contact.addText('hello@haveismash.com', {
    x: 0.5,
    y: 1.5,
    w: 12,
    h: 0.6,
    fontSize: 22,
    color: '22C55E',
  })
  contact.addText('havesmashed.com', {
    x: 0.5,
    y: 2.2,
    w: 12,
    h: 0.5,
    fontSize: 16,
    color: '475569',
  })
  contact.addText(ANONYMITY_NOTE, {
    x: 0.5,
    y: 6.5,
    w: 12,
    h: 0.6,
    fontSize: 10,
    color: '94A3B8',
    italic: true,
  })

  const fname = `havesmashed-mediakit-${opts.brandName ? slugify(opts.brandName) + '-' : ''}${today}.pptx`
  await pptx.writeFile({ fileName: fname })
}

function addBigNumber(slide: PptxGenJS.Slide, x: number, y: number, label: string, value: string) {
  slide.addShape('roundRect', {
    x,
    y,
    w: 3.0,
    h: 2.5,
    fill: { color: 'F8FAFC' },
    line: { color: 'E2E8F0', width: 1 },
    rectRadius: 0.1,
  })
  slide.addText(label, {
    x: x + 0.2,
    y: y + 0.3,
    w: 2.6,
    h: 0.5,
    fontSize: 12,
    color: '64748B',
  })
  slide.addText(value, {
    x: x + 0.2,
    y: y + 0.9,
    w: 2.6,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: '0F172A',
  })
}

// ── CSV ────────────────────────────────────────────────────────

export function exportSnapshotCsv(snapshot: Snapshot, opts: MediaKitOptions) {
  const today = new Date().toISOString().slice(0, 10)
  const slug = opts.brandName ? slugify(opts.brandName) + '-' : ''

  const seriesCsv = [
    'date,total_users,new_users,dau,mau,total_dates_logged,new_dates_logged',
    ...snapshot.series.map((r) =>
      [
        r.date,
        r.total_users,
        r.new_users,
        r.dau,
        r.mau,
        r.total_dates_logged,
        r.new_dates_logged,
      ].join(','),
    ),
  ].join('\n')

  const filteredSegments = opts.segmentKeys
    ? snapshot.segments.filter((s) => opts.segmentKeys!.includes(s.segment_key))
    : snapshot.segments
  const segCsv = [
    'segment_key,segment_value,cohort_size',
    ...filteredSegments.map((r) =>
      [r.segment_key, csvField(r.segment_value), r.cohort_size].join(','),
    ),
  ].join('\n')

  downloadText(`havesmashed-${slug}series-${today}.csv`, seriesCsv)
  downloadText(`havesmashed-${slug}segments-${today}.csv`, segCsv)
}

function csvField(s: string) {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Per-campaign brand report PDF ──────────────────────────────
//
// Smaller cousin of exportMediaKitPdf scoped to a single campaign.
// Brand-shareable: cover + privacy contract + headline performance +
// daily trend table + segment cohort sizes + notes. Honors the same
// anonymity disclaimer footer.

export type CampaignReportInput = {
  campaign: {
    id: string
    brand_name: string
    placement_key: string
    starts_at: string
    ends_at: string
    is_active: boolean
    is_dry_run: boolean
    daily_cap: number | null
    weight: number
    target_segment: Record<string, unknown> | null
    creative: Record<string, unknown>
  }
  window_days: number
  totals: {
    impressions: number
    clicks: number
    ctr: number
    avg_dwell_ms: number | null
    today_impressions: number
    daily_cap: number | null
    daily_cap_used_pct: number | null
  }
  daily_series: Array<{
    date: string
    impressions: number
    clicks: number
    ctr: number
  }>
  segment_breakdown: Array<{
    segment_key: string
    segment_value: string
    cohort_size: number
  }>
  k_threshold: number
  notes?: string | null
}

export async function exportCampaignBrandReportPdf(input: CampaignReportInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  const today = new Date().toISOString().slice(0, 10)
  const c = input.campaign
  const t = input.totals
  const title = `havesmashed — Campaign Report · ${c.brand_name}`

  // ── Cover ──
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setTextColor(34, 197, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(36)
  doc.text('havesmashed', margin, 200)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text(`Campaign Report for ${c.brand_name}`, margin, 240)
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Generated: ${today}`, margin, 270)
  doc.text(`Placement: ${c.placement_key}`, margin, 286)
  doc.text(
    `Window: last ${input.window_days} days · ${c.starts_at.slice(0, 10)} → ${c.ends_at.slice(0, 10)}`,
    margin,
    302,
  )
  if (c.is_dry_run) {
    doc.setTextColor(251, 191, 36)
    doc.text('DRY RUN — figures are real but no clicks are paid', margin, 322)
  }
  doc.setTextColor(148, 163, 184)
  doc.setFontSize(9)
  doc.text(ANONYMITY_NOTE, margin, pageH - 60, { maxWidth: pageW - 2 * margin })

  // ── Privacy ──
  doc.addPage()
  pageHeader(doc, title, pageW, margin)
  doc.setTextColor(34, 34, 34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Privacy-First by Design', margin, 110)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const bullets = [
    `K-anonymity: every cohort published is ≥ ${input.k_threshold} users.`,
    'No emails, phones, passwords. Auth is BIP39 seed phrase.',
    'No user identifiers, hashes, or device IDs are sold or shared.',
    'No third-party tracking pixels (Meta, Google, TikTok).',
    'Server-side targeting only — brand never sees who saw the ad.',
  ]
  let y = 140
  for (const b of bullets) {
    doc.text(`•  ${b}`, margin, y, { maxWidth: pageW - 2 * margin })
    y += 22
  }
  pageFooter(doc, pageW, pageH, margin)

  // ── Headline ──
  doc.addPage()
  pageHeader(doc, title, pageW, margin)
  doc.setTextColor(34, 34, 34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(`Performance — last ${input.window_days} days`, margin, 110)

  drawCard(doc, margin, 140, 220, 90, 'Impressions', fmtNum(t.impressions))
  drawCard(doc, margin + 240, 140, 220, 90, 'Clicks', fmtNum(t.clicks))
  drawCard(doc, margin, 250, 220, 90, 'CTR', `${(t.ctr * 100).toFixed(2)}%`)
  drawCard(
    doc,
    margin + 240,
    250,
    220,
    90,
    'Avg Dwell',
    t.avg_dwell_ms === null ? '—' : `${(t.avg_dwell_ms / 1000).toFixed(2)}s`,
  )

  if (t.daily_cap !== null) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(
      `Daily cap: ${fmtNum(t.daily_cap)} · today used ${t.today_impressions.toLocaleString()} (${(t.daily_cap_used_pct ?? 0).toFixed(0)}%)`,
      margin,
      370,
    )
  }
  pageFooter(doc, pageW, pageH, margin)

  // ── Daily trend table ──
  if (input.daily_series.length > 0) {
    doc.addPage()
    pageHeader(doc, title, pageW, margin)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(34, 34, 34)
    doc.text('Daily Trend', margin, 110)
    drawTable(
      doc,
      margin,
      130,
      ['Date', 'Impressions', 'Clicks', 'CTR'],
      input.daily_series.map((r) => [
        r.date,
        fmtNum(r.impressions),
        fmtNum(r.clicks),
        `${(r.ctr * 100).toFixed(2)}%`,
      ]),
      [120, 110, 110, 100],
    )
    pageFooter(doc, pageW, pageH, margin)
  }

  // ── Targeted audience ──
  if (input.segment_breakdown.length > 0) {
    doc.addPage()
    pageHeader(doc, title, pageW, margin)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(34, 34, 34)
    doc.text('Targeted Audience (cohort sizes)', margin, 110)
    drawTable(
      doc,
      margin,
      130,
      ['Segment Key', 'Segment Value', 'Cohort Size'],
      input.segment_breakdown.map((r) => [
        SEGMENT_LABELS[r.segment_key] ?? r.segment_key,
        r.segment_value,
        fmtNum(r.cohort_size),
      ]),
      [180, 180, 120],
    )
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text(
      'Cohort sizes reflect the most recent daily snapshot of the platform-wide segment. ' +
        'Brand never sees individuals.',
      margin,
      pageH - 60,
      { maxWidth: pageW - 2 * margin },
    )
    pageFooter(doc, pageW, pageH, margin)
  }

  // ── Notes ──
  if (input.notes) {
    doc.addPage()
    pageHeader(doc, title, pageW, margin)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(34, 34, 34)
    doc.text('Notes', margin, 110)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(input.notes, margin, 140, { maxWidth: pageW - 2 * margin })
    pageFooter(doc, pageW, pageH, margin)
  }

  const fname = `havesmashed-campaign-${slugify(c.brand_name)}-${today}.pdf`
  doc.save(fname)
}
