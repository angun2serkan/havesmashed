import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Calendar,
  Star,
  FileText,
  Users,
  MapPin,
  Heart,
  Sparkles,
  User,
  Ruler,
  Eye,
  MessageCircle,
  Plus,
  Check,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLogStore } from "@/stores/logStore";
import { api } from "@/services/api";
import {
  AGE_RANGES,
  HEIGHT_RANGES,
  loadTags,
  getTagsByCategory,
  addTagToCache,
  type TagDefinition,
  type Gender,
} from "@/data/tags";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function TagChips({
  tags,
  selectedIds,
  onToggle,
  category,
  onTagCreated,
  allowCreate = true,
}: {
  tags: TagDefinition[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  category: string;
  onTagCreated: (tag: TagDefinition) => void;
  allowCreate?: boolean;
}) {
  const [showInput, setShowInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await api.createTag(trimmed, category);
      const tag: TagDefinition = {
        id: created.id,
        name: created.name,
        category: created.category,
      };
      addTagToCache(tag);
      onTagCreated(tag);
      setNewTagName("");
      setShowInput(false);
    } catch {
      // silently fail — user can retry
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
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

      {allowCreate && (showInput ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setShowInput(false);
                setNewTagName("");
              }
            }}
            placeholder="Tag name"
            autoFocus
            className="w-24 px-2 py-1 rounded-full text-xs bg-dark-900 border border-dark-600 text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="p-1 rounded-full text-green-400 hover:bg-green-500/10 transition-colors cursor-pointer"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInput(false);
              setNewTagName("");
            }}
            className="p-1 rounded-full text-dark-400 hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="w-7 h-7 flex items-center justify-center rounded-full border border-dashed border-dark-500 text-dark-400 hover:text-neon-500 hover:border-neon-500/50 transition-colors cursor-pointer"
        >
          <Plus size={12} />
        </button>
      ))}
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

/* ------------------------------------------------------------------ */
/*  Main form                                                          */
/* ------------------------------------------------------------------ */

export function DateEntryForm() {
  const isOpen = useLogStore((s) => s.isDateFormOpen);
  const selectedCity = useLogStore((s) => s.selectedCity);
  const selectedCountry = useLogStore((s) => s.selectedCountry);
  const closeDateForm = useLogStore((s) => s.closeDateForm);
  const addDate = useLogStore((s) => s.addDate);

  const [gender, setGender] = useState<Gender | null>(null);
  const [ageRange, setAgeRange] = useState("");
  const [heightRange, setHeightRange] = useState("");
  const [personNickname, setPersonNickname] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [dateAt, setDateAt] = useState(
    new Date().toISOString().split("T")[0]!,
  );
  const [rating, setRating] = useState(5);
  const [faceRating, setFaceRating] = useState(5);
  const [bodyRating, setBodyRating] = useState(5);
  const [chatRating, setChatRating] = useState(5);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badgeNotification, setBadgeNotification] = useState<string[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  // bump this counter to force useMemo to re-derive tag lists after custom tag creation
  const [tagsVersion, setTagsVersion] = useState(0);

  useEffect(() => {
    loadTags()
      .then(() => setTagsLoaded(true))
      .catch(() => {});
  }, []);

  const meetingTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("meeting") : []),
    [tagsLoaded, tagsVersion],
  );
  const venueTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("venue") : []),
    [tagsLoaded, tagsVersion],
  );
  const activityTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("activity") : []),
    [tagsLoaded, tagsVersion],
  );
  const faceTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("face") : []),
    [tagsLoaded, tagsVersion],
  );
  const personalityTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("personality") : []),
    [tagsLoaded, tagsVersion],
  );
  const physicalFemaleTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("physical_female") : []),
    [tagsLoaded, tagsVersion],
  );
  const physicalMaleTags = useMemo(
    () => (tagsLoaded ? getTagsByCategory("physical_male") : []),
    [tagsLoaded, tagsVersion],
  );

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

  const handleTagCreated = useCallback((tag: TagDefinition) => {
    setTagsVersion((v) => v + 1);
    // auto-select the new tag
    setSelectedTagIds((prev) => new Set(prev).add(tag.id));
  }, []);

  const physicalTags = useMemo(() => {
    if (gender === "male") return physicalMaleTags;
    if (gender === "female") return physicalFemaleTags;
    return [];
  }, [gender, physicalMaleTags, physicalFemaleTags]);

  // When gender changes, clear physical tags from opposite gender
  const handleGenderChange = (g: Gender) => {
    setGender(g);
    const validPhysicalIds = new Set(
      (g === "male"
        ? physicalMaleTags
        : g === "female"
          ? physicalFemaleTags
          : []
      ).map((t) => t.id),
    );
    const allPhysicalIds = new Set(
      [...physicalMaleTags, ...physicalFemaleTags].map((t) => t.id),
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
    setHeightRange("");
    setPersonNickname("");
    setSelectedTagIds(new Set());
    setDateAt(new Date().toISOString().split("T")[0]!);
    setRating(5);
    setFaceRating(5);
    setBodyRating(5);
    setChatRating(5);
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
      const { date, newBadges } = await api.createDate({
        country_code: selectedCountry,
        city_id: selectedCity.id,
        gender,
        age_range: ageRange,
        height_range: heightRange || undefined,
        person_nickname: personNickname.trim() || undefined,
        description: description.trim() || undefined,
        rating,
        face_rating: faceRating,
        body_rating: bodyRating,
        chat_rating: chatRating,
        date_at: dateAt,
        tag_ids: Array.from(selectedTagIds),
      });

      addDate(date);

      if (newBadges.length > 0) {
        setBadgeNotification(newBadges);
        setTimeout(() => {
          setBadgeNotification([]);
          resetForm();
          closeDateForm();
        }, 3000);
      } else {
        resetForm();
        closeDateForm();
      }
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
        {/* 1. Cinsiyet (Gender) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <User size={14} />
            Cinsiyet
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

        {/* 2. Yas Araligi (Age Range) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Users size={14} />
            Yas Araligi
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

        {/* 2.5 Boy (Height Range) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Ruler size={14} />
            Boy
          </label>
          <select
            value={heightRange}
            onChange={(e) => setHeightRange(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500 transition-colors appearance-none cursor-pointer"
          >
            <option value="" disabled>Select height range</option>
            {HEIGHT_RANGES.map((range) => (
              <option key={range} value={range}>
                {range} cm
              </option>
            ))}
          </select>
        </div>

        {/* 3. Kisi (Person Nickname) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <User size={14} />
            Kisi
          </label>
          <input
            type="text"
            value={personNickname}
            onChange={(e) => {
              if (e.target.value.length <= 50) setPersonNickname(e.target.value);
            }}
            placeholder="Takma isim (opsiyonel)"
            maxLength={50}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
        </div>

        {/* 3. Tanisma Sekli (How You Met) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Heart size={14} />
            Tanisma Sekli
          </label>
          <TagChips
            tags={meetingTags}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
            category="meeting"
            onTagCreated={handleTagCreated}
          />
        </div>

        {/* 4. Date Mekani / Mekanlari (Venue) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <MapPin size={14} />
            Date Mekani
          </label>
          <TagChips
            tags={venueTags}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
            category="venue"
            onTagCreated={handleTagCreated}
          />
        </div>

        {/* 5. Aktiviteler (Activities) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Sparkles size={14} />
            Aktiviteler
          </label>
          <TagChips
            tags={activityTags}
            selectedIds={selectedTagIds}
            onToggle={toggleTag}
            category="activity"
            onTagCreated={handleTagCreated}
          />
        </div>

        {/* 6. Yuz Guzelligi (Face Beauty) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Eye size={14} />
            Yuz Guzelligi:{" "}
            <span className="text-neon-500 font-bold">{faceRating}</span>/10
          </label>
          <RatingSelector value={faceRating} onChange={setFaceRating} />
          <div className="mt-2">
            <TagChips
              tags={faceTags}
              selectedIds={selectedTagIds}
              onToggle={toggleTag}
              category="face"
              onTagCreated={handleTagCreated}
              allowCreate={false}
            />
          </div>
        </div>

        {/* 7. Vucut Guzelligi (Body Beauty) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <User size={14} />
            Vucut Guzelligi:{" "}
            <span className="text-neon-500 font-bold">{bodyRating}</span>/10
          </label>
          <RatingSelector value={bodyRating} onChange={setBodyRating} />
          {physicalTags.length > 0 && (
            <div className="mt-2">
              <TagChips
                tags={physicalTags}
                selectedIds={selectedTagIds}
                onToggle={toggleTag}
                category={gender === "male" ? "physical_male" : "physical_female"}
                onTagCreated={handleTagCreated}
                allowCreate={false}
              />
            </div>
          )}
        </div>

        {/* 8. Sohbet & Enerji (Chat & Energy) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <MessageCircle size={14} />
            Sohbet & Enerji:{" "}
            <span className="text-neon-500 font-bold">{chatRating}</span>/10
          </label>
          <RatingSelector value={chatRating} onChange={setChatRating} />
          <div className="mt-2">
            <TagChips
              tags={personalityTags}
              selectedIds={selectedTagIds}
              onToggle={toggleTag}
              category="personality"
              onTagCreated={handleTagCreated}
              allowCreate={false}
            />
          </div>
        </div>

        {/* 9. Tarih (Date) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Calendar size={14} />
            Tarih
          </label>
          <input
            type="date"
            value={dateAt}
            onChange={(e) => setDateAt(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500 transition-colors [color-scheme:dark]"
          />
        </div>

        {/* 10. Genel Puan (Overall Rating) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-dark-200 mb-2">
            <Star size={14} />
            Genel Puan:{" "}
            <span className="text-neon-500 font-bold">{rating}</span>/10
          </label>
          <RatingSelector value={rating} onChange={setRating} />
        </div>

        {/* 11. Aciklama (Description) */}
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-dark-200 mb-2">
            <span className="flex items-center gap-2">
              <FileText size={14} />
              Aciklama
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

        {/* Badge Notification */}
        {badgeNotification.length > 0 && (
          <div className="bg-neon-500/10 border border-neon-500/40 rounded-xl p-4 text-center animate-pulse">
            <p className="text-lg font-bold text-neon-400 mb-1">
              &#127942; Yeni Rozet!
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {badgeNotification.map((name) => (
                <span
                  key={name}
                  className="px-3 py-1 bg-neon-500/20 text-neon-300 text-sm font-medium rounded-full border border-neon-500/30 shadow-[0_0_10px_rgba(255,0,127,0.25)]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* 12. Submit */}
        <Button
          onClick={handleSubmit}
          className="w-full"
          size="lg"
          disabled={isSubmitting || badgeNotification.length > 0}
        >
          {isSubmitting ? "Saving..." : "Save Date"}
        </Button>
      </div>
    </Modal>
  );
}
