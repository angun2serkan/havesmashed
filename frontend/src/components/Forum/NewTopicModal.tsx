import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { api } from "@/services/api";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "tips", label: "Tips" },
  { value: "stories", label: "Stories" },
  { value: "questions", label: "Questions" },
  { value: "off-topic", label: "Off-topic" },
];

interface NewTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewTopicModal({ isOpen, onClose, onCreated }: NewTopicModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Baslik ve icerik zorunludur.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await api.createForumTopic({
        title: title.trim(),
        body: body.trim(),
        category,
        is_anonymous: isAnonymous,
      });
      setTitle("");
      setBody("");
      setCategory("general");
      setIsAnonymous(false);
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bir hata olustu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Yeni Konu">
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm text-dark-300 mb-1">Baslik</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            placeholder="Konu basligi..."
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors"
          />
          <span className="text-[10px] text-dark-500 mt-1 block text-right">
            {title.length}/200
          </span>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm text-dark-300 mb-1">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-500 transition-colors"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm text-dark-300 mb-1">Icerik</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 5000))}
            placeholder="Konunuz hakkinda yazin..."
            rows={6}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-neon-500 transition-colors resize-none"
          />
          <span className="text-[10px] text-dark-500 mt-1 block text-right">
            {body.length}/5000
          </span>
        </div>

        {/* Anonymous checkbox */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-neon-500 focus:ring-neon-500 accent-neon-500"
          />
          <span className="text-sm text-dark-300">Anonim paylas</span>
        </label>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !body.trim()}
          className="w-full"
        >
          {submitting ? "Paylasiliyor..." : "Paylas"}
        </Button>
      </div>
    </Modal>
  );
}
