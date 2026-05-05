import { useState, type FormEvent } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Partner, PartnerInput, EndReason, HowWeMet } from "@/types";

const HOW_WE_MET_OPTIONS: Array<{ value: HowWeMet; label: string }> = [
  { value: "app", label: "Uygulama" },
  { value: "friends", label: "Arkadaş çevresi" },
  { value: "work", label: "İş" },
  { value: "school", label: "Okul" },
  { value: "family", label: "Aile" },
  { value: "random", label: "Tesadüf" },
  { value: "other", label: "Diğer" },
];

const END_REASON_OPTIONS: Array<{ value: EndReason; label: string }> = [
  { value: "distance", label: "Uzaklık" },
  { value: "lost_interest", label: "İlgi kaybı" },
  { value: "cheating", label: "Aldatma" },
  { value: "incompatibility", label: "Uyumsuzluk" },
  { value: "mutual", label: "Karşılıklı" },
  { value: "other", label: "Diğer" },
];

interface PartnerFormProps {
  partner?: Partner;
  onCancel: () => void;
  onSubmit: (input: PartnerInput) => Promise<void>;
}

export function PartnerForm({ partner, onCancel, onSubmit }: PartnerFormProps) {
  const [name, setName] = useState(partner?.name ?? "");
  const [birthday, setBirthday] = useState(partner?.birthday ?? "");
  const [start, setStart] = useState(partner?.relationshipStart ?? "");
  const [end, setEnd] = useState(partner?.relationshipEnd ?? "");
  const [score, setScore] = useState<string>(
    partner?.satisfactionScore != null ? String(partner.satisfactionScore) : "",
  );
  const [endReason, setEndReason] = useState<EndReason | "">(
    partner?.endReason ?? "",
  );
  const [howWeMet, setHowWeMet] = useState<HowWeMet | "">(partner?.howWeMet ?? "");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("İsim gerekli");
    if (!birthday) return setError("Doğum günü gerekli");
    if (!start) return setError("İlişki başlangıcı gerekli");
    if (end && end < start) return setError("Bitiş tarihi başlangıçtan önce olamaz");
    if (start < birthday) return setError("İlişki başlangıcı doğum gününden önce olamaz");

    const input: PartnerInput = {
      name: name.trim(),
      birthday,
      relationship_start: start,
      relationship_end: end || null,
      satisfaction_score: score ? Number(score) : null,
      end_reason: endReason || null,
      how_we_met: howWeMet || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-dark-800 border border-dark-600 rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {partner ? "Partner düzenle" : "Yeni partner"}
          </h2>
          <button
            onClick={onCancel}
            className="text-dark-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="İsim *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="input"
              required
            />
          </Field>

          <Field label="Doğum günü *">
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="input [color-scheme:dark]"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlangıç *">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="input [color-scheme:dark]"
                required
              />
            </Field>
            <Field label="Bitiş">
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="input [color-scheme:dark]"
              />
            </Field>
          </div>

          <p className="text-[10px] text-dark-400 -mt-1">
            Hâlâ devam eden ilişki için bitişi boş bırak
          </p>

          <Field label="Memnuniyet (1-10)">
            <input
              type="number"
              min={1}
              max={10}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="input"
              placeholder="opsiyonel"
            />
          </Field>

          <Field label="Tanışma şekli">
            <select
              value={howWeMet}
              onChange={(e) => setHowWeMet(e.target.value as HowWeMet | "")}
              className="input"
            >
              <option value="">Belirtilmemiş</option>
              {HOW_WE_MET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {end && (
            <Field label="Bitiş sebebi">
              <select
                value={endReason}
                onChange={(e) => setEndReason(e.target.value as EndReason | "")}
                className="input"
              >
                <option value="">Belirtilmemiş</option>
                {END_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Not">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[60px]"
              maxLength={500}
            />
          </Field>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Kaydet"}
            </Button>
          </div>
        </form>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: rgb(15 17 22 / 1);
          border: 1px solid rgb(64 71 86 / 1);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
          transition: border-color 150ms;
        }
        .input:focus {
          border-color: rgb(34 197 94 / 1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-dark-400 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
