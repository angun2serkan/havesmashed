import { useState } from "react";
import { Copy, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SeedPhraseDisplayProps {
  phrase: string;
  onConfirm: () => void;
}

export function SeedPhraseDisplay({
  phrase,
  onConfirm,
}: SeedPhraseDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const words = phrase.split(" ");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(phrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <ShieldCheck size={48} className="mx-auto text-neon-500 mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">
          Your Recovery Phrase
        </h2>
        <p className="text-sm text-dark-300">
          Write these 12 words down and store them somewhere safe. This is the
          only way to access your account.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {words.map((word, i) => (
          <div
            key={i}
            className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-center"
          >
            <span className="text-xs text-dark-500 mr-1">{i + 1}.</span>
            <span className="text-sm font-mono text-white">{word}</span>
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={handleCopy}
        className="w-full"
      >
        {copied ? (
          <>
            <Check size={16} className="mr-2" />
            Copied!
          </>
        ) : (
          <>
            <Copy size={16} className="mr-2" />
            Copy to Clipboard
          </>
        )}
      </Button>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-1 accent-neon-500"
        />
        <span className="text-sm text-dark-200">
          I have saved my recovery phrase in a secure location. I understand
          that if I lose it, I will permanently lose access to my account.
        </span>
      </label>

      <Button onClick={onConfirm} disabled={!saved} className="w-full" size="lg">
        Continue
      </Button>
    </div>
  );
}
