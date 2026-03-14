import { StatsCards } from "@/components/Stats/StatsCards";
import { Card } from "@/components/ui/Card";
import { useLogStore } from "@/stores/logStore";
import { MapPin, Star, Calendar } from "lucide-react";
import { ALL_TAGS_BY_ID } from "@/data/tags";

/** Color mapping for tag categories based on id ranges */
function getTagColor(id: number): string {
  if (id >= 1 && id <= 10) return "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30";
  if (id >= 11 && id <= 25) return "bg-neon-500/15 text-neon-400 border-neon-500/30";
  if (id >= 26 && id <= 45) return "bg-accent-purple/15 text-accent-purple border-accent-purple/30";
  return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
}

export function DashboardPage() {
  const dates = useLogStore((s) => s.dates);

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <StatsCards />

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
          All Dates
        </h2>

        {dates.length === 0 ? (
          <Card className="text-center py-12">
            <MapPin size={40} className="mx-auto text-dark-500 mb-3" />
            <p className="text-dark-400">No dates yet</p>
            <p className="text-dark-500 text-sm mt-1">
              Go to the globe and tap a country to start logging
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {dates.map((date) => (
              <Card key={date.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-neon-500/10 flex items-center justify-center shrink-0">
                    <MapPin size={18} className="text-neon-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-white">
                        {date.countryCode}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Star size={14} className="text-neon-500" />
                        <span className="text-sm font-bold text-neon-500">
                          {date.rating}/10
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-dark-400 mb-2">
                      <span className="capitalize">{date.gender}</span>
                      <span>{date.ageRange}</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {date.dateAt}
                      </span>
                    </div>

                    {date.description && (
                      <p className="text-xs text-dark-300 mb-2 line-clamp-2">
                        {date.description}
                      </p>
                    )}

                    {date.tagIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {date.tagIds.map((tagId) => {
                          const tag = ALL_TAGS_BY_ID[tagId];
                          if (!tag) return null;
                          return (
                            <span
                              key={tagId}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getTagColor(tagId)}`}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
