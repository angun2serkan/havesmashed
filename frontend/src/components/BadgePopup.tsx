export function TopBadge({ icon }: { icon: string | null }) {
  if (!icon) return null;
  return <span className="text-sm" title="Top badge">{icon}</span>;
}
