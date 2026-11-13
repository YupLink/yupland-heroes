// Артефакт по словам (владелец 28.10: «по словам или рандомно — напишу наручи,
// делает наручи»): поле, редкость («сертификат»), «Создать». Пусто — рандом.
import { useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CRAFT_RARITIES, type CraftRarity } from "@/lib/craft/craftTable";
import { WORDS_MAX } from "@/lib/craft/craftWords";
import { useLabLabels } from "./labLabels";
import type { LabDraft } from "./useLab";
import { useVoice } from "./useVoice";

export function LabForm({ onCraft, busy }: { onCraft: (d: LabDraft) => void; busy: boolean }) {
  const t = useT();
  const L = useLabLabels();
  const [words, setWords] = useState("");
  const [rarity, setRarity] = useState<CraftRarity>("common");
  // Сказанное голосом — в поле (дописывается к набранному), можно поправить.
  const voice = useVoice((heard) => setWords((w) => (w.trim() ? `${w.trim()} ${heard}` : heard)));

  return (
    <section className="space-y-3">
      <div className="relative">
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          maxLength={WORDS_MAX}
          rows={2}
          placeholder={t("lab.words")}
          className="w-full resize-none rounded-xl bg-card py-3 pl-4 pr-14 text-base outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-gold/40"
        />
        <button
          type="button"
          onClick={voice.toggle}
          disabled={voice.state === "busy"}
          aria-label={t("lab.mic")}
          className={cn(
            "absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full transition",
            voice.state === "rec"
              ? "bg-destructive/20 text-destructive"
              : "text-muted-foreground hover:text-gold",
          )}
        >
          {voice.state === "busy" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : voice.state === "rec" ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>
      </div>
      <div className="flex gap-1 rounded-xl bg-card p-1">
        {CRAFT_RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRarity(r)}
            className={cn(
              "min-w-0 flex-1 rounded-lg px-0.5 py-2 text-xs transition sm:text-sm",
              r === rarity ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {L.meta(r)}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onCraft({ rarity, words })}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-semibold text-gold-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("lab.create")}
      </button>
    </section>
  );
}
