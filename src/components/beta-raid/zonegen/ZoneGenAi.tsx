// «Составить рецепт ИИ»: описание словами → рецепт зоны.
//
// ИИ живёт только на сервере (adminZoneRecipeAi, права админа проверяет он
// сам): ключи провайдера до клиента не доезжают. Отказ «ИИ не настроен»
// сервер бросает ключом словаря — humanError переводит его сам.
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { ZoneRecipe } from "@/lib/raid/zonegen/recipe";
import { adminZoneRecipeAi } from "@/server/api/beta-raid/zonegen/ai-recipe-api";

export function ZoneGenAi({
  cellCount,
  disabled,
  onRecipe,
}: {
  /** Сколько клеток в зоне — ИИ подбирает масштаб пятен под её размер. */
  cellCount: number;
  disabled?: boolean;
  /** Готовый рецепт (без сида) — панель подставит его в форму. */
  onRecipe: (recipe: Omit<ZoneRecipe, "seed">) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compose = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const out = await adminZoneRecipeAi({ data: { text: trimmed, cellCount } });
      onRecipe(out.recipe);
      if (out.note) setNote(out.note);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={t("zonegen.ai_placeholder")}
        className="w-full resize-none rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/70"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void compose()}
          disabled={disabled || busy || !text.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-secondary/40 px-2 py-1 text-[11px] font-semibold text-foreground transition disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          {busy ? t("zonegen.ai_busy") : t("zonegen.ai_compose")}
        </button>
        {note && (
          <span className="min-w-0 flex-1 text-[10px] text-muted-foreground">
            {t("zonegen.ai_note", { note })}
          </span>
        )}
        {error && <span className="min-w-0 flex-1 text-[10px] text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
