// Registry of published quarterly reports.
//
// To add a new report:
//   1. Create a new file (e.g. Q2_2026.tsx) using Q1_2026.tsx as a template
//   2. Append its meta + lazy import to REPORTS below
//   3. Done — it appears in /reports index automatically

import { lazy } from "react";
import type { ComponentType } from "react";
import type { ReportMeta } from "./ReportLayout";

export type ReportEntry = ReportMeta & {
  component: ComponentType;
};

export const REPORTS: ReportEntry[] = [
  {
    slug: "q1-2026",
    title: "havesmashed Türkiye Dating Index — Q1 2026",
    period: "Q1 2026 · Ocak – Mart",
    publishedAt: "2026-04-15",
    summary:
      "Türkiye'de dating davranışının çeyreklik anonim raporu. Kohort sayıları, şehir dağılımı ve davranış trendleri.",
    component: lazy(() => import("./Q1_2026").then((m) => ({ default: m.Q1_2026 }))),
  },
];
