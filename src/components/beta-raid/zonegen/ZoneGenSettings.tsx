// Ручки рецепта зоны: масштаб пятен, извилистость, плотность декора, строгость
// декора, порог малой зоны, сид. Вынесено из ZoneGenPanel ради правила ≤250 строк.
//
// Сид — ПОЛЕ ТЕКСТА, а не число: «Северный архипелаг» запоминается и
// пересказывается, девятизначное 1743920117 — нет. Фраза превращается в число
// (seedFromText), под полем видно, во что именно: с этим числом ту же зону
// повторит и генератор, и сосед, которому его продиктовали.
import { useRef, useState } from "react";
import { Copy, Dices } from "lucide-react";
import { useT } from "@/lib/i18n";
import { copyText } from "@/lib/copyText";
import { newSeed, type ZoneRecipe } from "@/lib/raid/zonegen/recipe";
import { parseSeedInput } from "@/lib/raid/zonegen/seed";
import { clampNum } from "./zoneGenHelpers";

const FIELD =
  "rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] tabular-nums text-foreground";

export function ZoneGenSettings({
  recipe,
  onPatch,
}: {
  recipe: ZoneRecipe;
  onPatch: (part: Partial<ZoneRecipe>) => void;
}) {
  const t = useT();
  const seedRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  // Пока поле набирают, показываем НАБРАННОЕ: в рецепт фраза ложится обрезанной
  // по краям, и без черновика пробел посреди набора пропадал бы под пальцами.
  const [draft, setDraft] = useState<string | null>(null);
  // Фраза живёт в рецепте, а не только в поле: её же кладём в локалку и
  // показываем после перезагрузки вместо голого числа.
  const seedShown = draft ?? recipe.seedText ?? String(recipe.seed);
  const isPhrase = (recipe.seedText ?? "") !== "";

  const editSeed = (raw: string) => {
    const typed = raw.slice(0, 80);
    setCopied(null);
    setDraft(typed);
    // Пустое поле не повод менять сид: человек стирает, чтобы набрать заново.
    if (!typed.trim()) return;
    const { seed, text } = parseSeedInput(typed);
    onPatch({ seed, seedText: text ?? undefined });
  };

  /** Сид поменяли кнопкой — набранное в поле больше не про него. */
  const rollSeed = () => {
    setCopied(null);
    setDraft(null);
    onPatch({ seed: newSeed(), seedText: undefined });
  };

  const copySeed = async () => {
    const ok = await copyText(seedShown);
    setCopied(ok ? "ok" : "fail");
    // Буфер закрыт окружением (бывает в вебвью Telegram) — выделяем текст,
    // чтобы его можно было забрать руками, и показываем само число.
    if (!ok) seedRef.current?.select();
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Масштаб пятен: 2 — рябь, 80 — материки. Ползунок + число, чтобы с
          телефона попадать в значение, а не в соседнее. */}
      <label className="flex items-center gap-2" title={t("zonegen.scale_hint")}>
        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
          {t("zonegen.scale")}
        </span>
        <input
          type="range"
          min={2}
          max={80}
          step={1}
          value={recipe.scale}
          onChange={(e) => onPatch({ scale: clampNum(e.target.value, 2, 80) })}
          className="range-gold min-w-0 flex-1"
        />
        <span className="w-8 text-right text-[11px] tabular-nums">{recipe.scale}</span>
      </label>
      {/* Шкала словами: на телефоне тултипа нет, а «12» сам по себе ни о чём. */}
      <p className="-mt-1 pl-26 text-[10px] text-muted-foreground">{t("zonegen.scale_hint")}</p>

      <label className="flex items-center gap-2" title={t("zonegen.warp_hint")}>
        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{t("zonegen.warp")}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={recipe.warp}
          onChange={(e) => onPatch({ warp: clampNum(e.target.value, 0, 1) })}
          className="range-gold min-w-0 flex-1"
        />
        <span className="w-8 text-right text-[11px] tabular-nums">
          {Math.round(recipe.warp * 100)}%
        </span>
      </label>
      <p className="-mt-1 pl-26 text-[10px] text-muted-foreground">{t("zonegen.warp_hint")}</p>

      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
          {t("zonegen.decor_rate")}
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={0.1}
          value={recipe.decorRate}
          onChange={(e) => onPatch({ decorRate: clampNum(e.target.value, 0, 3) })}
          title={t("zonegen.decor_rate_hint")}
          className="range-gold min-w-0 flex-1"
        />
        <span className="w-8 text-right text-[11px] tabular-nums">
          ×{recipe.decorRate.toFixed(1)}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={recipe.decorStrict}
            onChange={(e) => onPatch({ decorStrict: e.target.checked })}
            className="accent-gold"
          />
          {t("zonegen.decor_strict")}
        </label>
        <label
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
          title={t("zonegen.small_single_hint")}
        >
          {t("zonegen.small_single")}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={500}
            value={recipe.smallSingle}
            onChange={(e) => onPatch({ smallSingle: Math.round(clampNum(e.target.value, 0, 500)) })}
            className={`w-14 text-right ${FIELD}`}
          />
        </label>
      </div>

      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{t("zonegen.seed")}</span>
        <input
          ref={seedRef}
          type="text"
          value={seedShown}
          maxLength={80}
          onChange={(e) => editSeed(e.target.value)}
          onBlur={() => setDraft(null)}
          placeholder={t("zonegen.seed_placeholder")}
          className={`min-w-0 flex-1 text-left ${FIELD}`}
        />
        <button
          type="button"
          onClick={() => void copySeed()}
          title={t("zonegen.seed_copy")}
          className="rounded-lg bg-secondary/40 p-1 text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={rollSeed}
          title={t("zonegen.seed_roll")}
          className="rounded-lg bg-secondary/40 p-1 text-foreground"
        >
          <Dices className="h-3.5 w-3.5" />
        </button>
      </label>
      <p className="-mt-1 pl-26 text-[10px] text-muted-foreground tabular-nums">
        {copied === "ok"
          ? t("zonegen.seed_copied")
          : copied === "fail"
            ? t("zonegen.seed_copy_failed", { n: recipe.seed })
            : isPhrase
              ? t("zonegen.seed_value", { n: recipe.seed })
              : t("zonegen.seed_hint")}
      </p>
    </div>
  );
}
