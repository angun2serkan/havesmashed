import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SeedPhraseInputProps {
  onSubmit: (secretPhrase: string) => void;
  loading?: boolean;
}

export function SeedPhraseInput({ onSubmit, loading }: SeedPhraseInputProps) {
  const [phrase, setPhrase] = useState("");

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;

  const handleSubmit = () => {
    const trimmed = phrase.trim().toLowerCase();
    onSubmit(trimmed);
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <KeyRound size={48} className="mx-auto text-neon-500 mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">
          Enter Recovery Phrase
        </h2>
        <p className="text-sm text-dark-300">
          Enter your 12-word recovery phrase to sign in.
        </p>
      </div>

      <textarea
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (wordCount === 12) handleSubmit();
          }
        }}
        placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
        rows={3}
        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder:text-dark-500 focus:outline-none focus:border-neon-500 resize-none"
      />

      <p className="text-xs text-dark-400 text-right">
        {wordCount}/12 words
      </p>

      <Button
        onClick={handleSubmit}
        disabled={loading || wordCount !== 12}
        className="w-full"
        size="lg"
      >
        {loading ? "Signing in..." : "Sign In"}
      </Button>
    </div>
  );
}
