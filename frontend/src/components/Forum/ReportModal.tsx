import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { api } from "@/services/api";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "topic" | "comment";
  targetId: string;
}

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "insult", label: "Hakaret" },
  { value: "inappropriate", label: "Uygunsuz Icerik" },
  { value: "misinformation", label: "Yanlis Bilgi" },
  { value: "other", label: "Diger" },
];

export function ReportModal({ isOpen, onClose, targetType, targetId }: ReportModalProps) {
  const [reason, setReason] = useState("spam");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await api.reportForumContent({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim() || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bir hata olustu.";
      if (msg.toLowerCase().includes("already")) {
        setError("Bu icerigi zaten raporlamistiniz.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason("spam");
    setDescription("");
    setError("");
    setSuccess(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Icerigi Raporla">
      <div className="space-y-4">
        {success ? (
          <div className="text-center py-4">
            <p className="text-green-400 font-semibold mb-2">Raporunuz alindi</p>
            <p className="text-sm text-dark-400 mb-4">
              Raporunuz incelemeye alinmistir. Tesekkurler.
            </p>
            <Button onClick={handleClose} size="sm">
              Kapat
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Reason selection */}
            <div>
              <label className="block text-sm text-dark-300 mb-2">Sebep</label>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="w-4 h-4 border-dark-600 bg-dark-900 text-neon-500 focus:ring-neon-500 accent-neon-500"
                    />
                    <span className="text-sm text-dark-300 group-hover:text-dark-200 transition-colors">
                      {r.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-dark-300 mb-1">
                Aciklama (istege bagli)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Ek detay ekleyin..."
                rows={3}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors resize-none"
              />
              <span className="text-[10px] text-dark-500 mt-1 block text-right">
                {description.length}/500
              </span>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Gonderiliyor..." : "Raporla"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
