import { useState, useMemo } from "react";
import {
  Calendar,
  Star,
  FileText,
  Users,
  MapPin,
  Heart,
  Sparkles,
  User,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLogStore } from "@/stores/logStore";
import { api } from "@/services/api";
import {
  MEETING_TAGS,
  VENUE_TAGS,
  ACTIVITY_TAGS,
  PHYSICAL_FEMALE_TAGS,
  PHYSICAL_MALE_TAGS,
  AGE_RANGES,
  type TagDefinition,
  type Gender,
} from "@/data/tags";

function TagChips({
  tags,
  selectedIds,
  onToggle,
}: {
  tags: TagDefinition[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = selectedIds.has(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
              selected
                ? "bg-neon-500/20 text-neon-400 border border-neon-500/50 shadow-[0_0_8px_rgba(255,0,127,0.3)]"
                : "bg-dark-700 text-dark-300 border border-dark-600 hover:border-dark-400 hover:text-dark-200"
            }`}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}

function RatingSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer ${
            n <= value
              ? "bg-neon-500/20 text-neon-400 border border-neon-500/50 shadow-[0_0_6px_rgba(255,0,127,0.25)]"
              : "bg-dark-700 text-dark-500 border border-dark-600 hover:border-dark-400 hover:text-dark-300"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function DateEntryForm() {
  const isOpen = useLogStore((s) => s.isDateFormOpen);
  const selectedCity = useLogStore((s) => s.selectedCity);
  const selectedCountry = useLogStore((s) => s.selectedCountry);
  const closeDateForm = useLogStore((s) => s.closeDateForm);
  const addDate = useLogStore((s) => s.addDate);

  const [gender, setGender] = useState<Gender | null>(null);
  const [ageRange, setAgeRange] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [dateAt, setDateAt] = useState(
    new Date().toISOString().split("T")[0]!,
  );
  const [rating, setRating] = useState(5);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const physicalTags = useMemo(() => {
    if (gender === "male") return PHYSICAL_MALE_TAGS;
    if (gender === "female") return PHYSICAL_FEMALE_TAGS;
    return [];
  }, [gender]);

  // When gender changes, clear physical tags from opposite gender
  const handleGenderChange = (g: Gender) => {
    setGender(g);
    // Remove physical tags that don't match the new gender
    const validPhysicalIds = new Set(
      (g === "male" ? PHYSICAL_MALE_TAGS : g === "female" ? PHYSICAL_FEMALE_TAGS : []).map(
        (t) => t.id,
      ),
    );
    const allPhysicalIds = new Set(
      [...PHYSICAL_MALE_TAGS, ...PHYSICAL_FEMALE_TAGS].map((t) => t.id),
    );
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        if (allPhysicalIds.has(id) && !validPhysicalIds.has(id)) {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const resetForm = () => {
    setGender(null);
    setAgeRange("");
    setSelectedTagIds(new Set());
    setDateAt(new Date().toISOString().split("T")[0]!);
    setRating(5);
    setDescription("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedCity || !selectedCountry || !gender || !ageRange) {
      setError("Please fill in gender and age range.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.createDate({
        country_code: selectedCountry,
        city_id: selectedCity.id,
        gender,
        age_range: ageRange,
        description: description.trim() || undefined,
        rating,
        date_at: dateAt,
        tag_ids: Array.from(selectedTagIds),
      });

      addDate(result);
      resetForm();
      closeDateForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save date");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    closeDateForm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        selectedCity ? `New Date -- ${selectedCity.name}` : "New Date Entry"
      }
    >
      <div className="space-y-5">
        {/* Gender */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <User size={14} />
            Gender
          </label>
          <div className="flex gap-2">
            {(["female", "male", "other"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGenderChange(g)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer capitalize ${
                  gender === g
                    ? "bg-neon-500/20 text-neon-400 border border-neon-500/50 shadow-[0_0_8px_rgba(255,0,127,0.3)]"
                    : "bg-dark-700 text-dark-300 border border-dark-600 hover:border-dark-400"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Age Range */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Users size={14} />
            Age Range
          </label>
          <select
            value={ageRange}
            onChange={(e) => setAgeRange(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="" disabled>
              Select age range
            </option>
            {AGE_RANGES.map((range) => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
        </div>

        {/* How You Met */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Heart size={14} />
            How You Met
          </label>
          <TagChips
            tags={MEETING_TAGS}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
          />
        </div>

        {/* Venue Type */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <MapPin size={14} />
            Venue Type
          </label>
          <TagChips
            tags={VENUE_TAGS}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
          />
        </div>

        {/* Activities */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Sparkles size={14} />
            Activities
          </label>
          <TagChips
            tags={ACTIVITY_TAGS}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
          />
        </div>

        {/* Physical Traits (shown only when gender is male or female) */}
        {physicalTags.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
              <User size={14} />
              Physical Traits
            </label>
            <TagChips
              tags={physicalTags}
              selectedIds={selectedTagIds}
              onToggle={toggleTag}
            />
          </div>
        )}

        {/* Date */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Calendar size={14} />
            Date
          </label>
          <input
            type="date"
            value={dateAt}
            onChange={(e) => setDateAt(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500 transition-colors [color-scheme:dark]"
          />
        </div>

        {/* Rating 1-10 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Star size={14} />
            Rating:{" "}
            <span className="text-neon-500 font-bold">{rating}</span>/10
          </label>
          <RatingSelector value={rating} onChange={setRating} />
        </div>

        {/* Description */}
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-dark-200 mb-2">
            <span className="flex items-center gap-2">
              <FileText size={14} />
              Description
            </span>
            <span
              className={`text-xs ${description.length > 460 ? "text-red-400" : "text-dark-500"}`}
            >
              {description.length}/500
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              if (e.target.value.length <= 500) setDescription(e.target.value);
            }}
            placeholder="How was the date? Any memorable moments..."
            rows={3}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          className="w-full"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save Date"}
        </Button>
      </div>
    </Modal>
  );
}
