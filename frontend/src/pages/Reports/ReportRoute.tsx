import { Suspense } from "react";
import { useParams, Navigate } from "react-router-dom";
import { REPORTS } from "./index";

export function ReportRoute() {
  const { slug } = useParams();
  const entry = REPORTS.find((r) => r.slug === slug);

  if (!entry) return <Navigate to="/reports" replace />;

  const Component = entry.component;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-dark-950 flex items-center justify-center">
          <p className="text-sm text-dark-500">Yükleniyor…</p>
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
