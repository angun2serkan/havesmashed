import { Globe, MapPin, Flag, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLogStore } from "@/stores/logStore";

export function StatsCards() {
  const stats = useLogStore((s) => s.stats);

  const cards = [
    {
      label: "Total Dates",
      value: stats.totalDates,
      icon: MapPin,
      color: "text-neon-500",
    },
    {
      label: "Countries",
      value: stats.uniqueCountries,
      icon: Flag,
      color: "text-accent-cyan",
    },
    {
      label: "Cities",
      value: stats.uniqueCities,
      icon: Globe,
      color: "text-accent-purple",
    },
    {
      label: "Avg Rating",
      value:
        stats.averageRating !== null
          ? `${stats.averageRating.toFixed(1)}/10`
          : "--",
      icon: Star,
      color: "text-yellow-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="text-center">
          <Icon size={24} className={`mx-auto mb-2 ${color}`} />
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-dark-400 mt-1">{label}</p>
        </Card>
      ))}
    </div>
  );
}
