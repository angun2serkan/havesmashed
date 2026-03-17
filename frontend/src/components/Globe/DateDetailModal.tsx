import { Modal } from "@/components/ui/Modal";
import { getCountryName } from "@/utils/countryName";
import { getTagById, loadTags } from "@/data/tags";
import {
  Star,
  Smile,
  Dumbbell,
  MessageCircle,
  Calendar,
  User,
  Ruler,
} from "lucide-react";
import { useEffect, useState } from "react";

export interface DateDetailData {
  cityName: string | null;
  countryCode: string;
  dateAt: string;
  gender: string;
  ageRange: string;
  heightRange: string | null;
  personNickname: string | null;
  description: string | null;
  rating: number;
  faceRating: number | null;
  bodyRating: number | null;
  chatRating: number | null;
  tagIds: number[];
  ownerNickname: string;
  ownerColor: string;
}

interface DateDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: DateDetailData | null;
}

function RatingBadge({
  label,
  value,
  icon: Icon,
  bgClass,
  textClass,
  borderClass,
}: {
  label: string;
  value: number | null;
  icon: typeof Star;
  bgClass: string;
  textClass: string;
  borderClass: string;
}) {
  if (value === null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${bgClass} ${textClass} border ${borderClass}`}
    >
      <Icon size={10} /> {label}: {value}
    </span>
  );
}

export function DateDetailModal({ isOpen, onClose, date }: DateDetailModalProps) {
  const [tagsReady, setTagsReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTags().then(() => setTagsReady(true)).catch(() => {});
    }
  }, [isOpen]);

  if (!date) return null;

  const location = [date.cityName, getCountryName(date.countryCode)]
    .filter(Boolean)
    .join(", ");

  const genderLabel =
    date.gender === "male"
      ? "Erkek"
      : date.gender === "female"
        ? "Kadin"
        : "Diger";

  const formattedDate = new Date(date.dateAt).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tagNames = tagsReady
    ? date.tagIds
        .map((id) => getTagById(id))
        .filter(Boolean)
        .map((t) => t!.name)
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        {/* Header with owner + location */}
        <div
          className="rounded-lg px-4 py-3"
          style={{
            backgroundColor: `${date.ownerColor}15`,
            borderLeft: `3px solid ${date.ownerColor}`,
          }}
        >
          <p
            className="text-sm font-bold"
            style={{ color: date.ownerColor }}
          >
            {date.ownerNickname}
          </p>
          <p className="text-white text-lg font-semibold">{location}</p>
        </div>

        {/* Date info row */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-dark-300">
          <span className="flex items-center gap-1">
            <User size={14} className="text-dark-400" />
            {genderLabel}
          </span>
          <span>{date.ageRange} yas</span>
          {date.heightRange && (
            <span className="flex items-center gap-1">
              <Ruler size={14} className="text-dark-400" />
              {date.heightRange} cm
            </span>
          )}
          {date.personNickname && (
            <span className="text-dark-200 font-medium">
              "{date.personNickname}"
            </span>
          )}
        </div>

        {/* Ratings */}
        <div className="flex flex-wrap items-center gap-2">
          <RatingBadge
            label="Face"
            value={date.faceRating}
            icon={Smile}
            bgClass="bg-pink-500/15"
            textClass="text-pink-400"
            borderClass="border-pink-500/30"
          />
          <RatingBadge
            label="Body"
            value={date.bodyRating}
            icon={Dumbbell}
            bgClass="bg-orange-500/15"
            textClass="text-orange-400"
            borderClass="border-orange-500/30"
          />
          <RatingBadge
            label="Chat"
            value={date.chatRating}
            icon={MessageCircle}
            bgClass="bg-cyan-500/15"
            textClass="text-cyan-400"
            borderClass="border-cyan-500/30"
          />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <Star size={10} /> Overall: {date.rating}
          </span>
        </div>

        {/* Tags */}
        {tagNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagNames.map((name) => (
              <span
                key={name}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-dark-700 text-dark-200 border border-dark-600"
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {date.description && (
          <div className="bg-dark-700/50 rounded-lg p-3">
            <p className="text-sm text-dark-200 leading-relaxed">
              {date.description}
            </p>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-1.5 text-xs text-dark-400">
          <Calendar size={12} />
          {formattedDate}
        </div>
      </div>
    </Modal>
  );
}
