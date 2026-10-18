// Плитка одного заклинания: компактная строка-карточка.
//
// Три состояния читаются без вчитывания:
//   • готово — золотая рамка, живая жёлтая кнопка справа;
//   • откат — сепия сверху, часы поверх иконки, кнопка мертва;
//   • нельзя — сепия, замок поверх иконки, текст-причина на кнопке.
//
// Свёрнуто по сравнению с прошлой версией: имя не режется, «ЧТО ДАЁТ»
// подзаголовок и строка «без интеллекта было …» убраны — скидка уже видна
// в шапке (Интеллект → −N%). Иконка 48, gifts одной строкой золотом.
import { BookMinus, Loader2, Lock, Sparkles, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { cooldownClock, spellBlock, spellGiftLines } from "./spellText";
import type { SpellBookEntry } from "@/server/api/beta-raid/spell-book";

export function SpellTile({
  entry,
  energy,
  busy,
  onCast,
  onForget,
  readOnly = false,
}: {
  entry: SpellBookEntry;
  /** Текущая энергия игрока; null — баланс ещё едет. */
  energy: number | null;
  busy: boolean;
  onCast: () => void;
  /** «Забыть» — только в своей книге; в просмотре чужого героя кнопки нет. */
  onForget?: () => void;
  readOnly?: boolean;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const block = spellBlock(entry, energy, t);
  const locked = block !== null;
  const gifts = spellGiftLines(entry, lang, t);
  // «Было столько же» — подсказка титла, чтобы шум не грузил строку.
  const wasHint =
    entry.baseEnergyCost !== entry.energyCost || entry.baseCooldownMinutes !== entry.cooldownMinutes
      ? t("braid.spell_base_was", {
          energy: entry.baseEnergyCost,
          min: entry.baseCooldownMinutes,
        })
      : null;

  return (
    <article
      className={cn(
        "flex overflow-hidden rounded-2xl border bg-card",
        locked ? "border-border/60" : "border-gold/40",
      )}
    >
      {/* Иконка слева на всю высоту карточки, часы/замок — оверлеем на ней. */}
      <div
        className={cn(
          "relative h-auto w-14 shrink-0 overflow-hidden bg-secondary/40",
          locked && "sepia",
        )}
      >
        {entry.image ? (
          <img
            src={thumb(entry.image, 160, "black")}
            alt=""
            className={cn("h-full w-full object-cover", locked && "brightness-75")}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-gold/40">
            <Sparkles className={cn("h-6 w-6", locked && "opacity-50")} />
          </div>
        )}
        {block?.waiting && (
          <div className="absolute inset-0 grid place-items-center bg-black/65 text-center">
            <span className="font-mono text-[12px] font-extrabold leading-none text-gold">
              {cooldownClock(entry.cooldownLeftSec)}
            </span>
          </div>
        )}
        {locked && !block.waiting && (
          <div className="absolute inset-0 grid place-items-center bg-black/60">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Тело: имя + описание + gifts + пилюли — всё в одной колонке, узко.
          overflow-hidden: на десктопе (две колонки) пилюли шире тела и
          налезали на «Забыть» под кнопкой — обрезаем по краю тела. */}
      <div className={cn("min-w-0 flex-1 space-y-1 overflow-hidden p-2", locked && "sepia")}>
        <h4
          className={cn(
            "truncate text-sm font-bold leading-tight",
            locked && "text-muted-foreground",
          )}
        >
          {entry.name}
        </h4>
        {entry.description && (
          <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground">
            {entry.description}
          </p>
        )}
        {gifts.length > 0 && (
          <p
            className="line-clamp-1 text-[10px] font-semibold leading-snug text-gold"
            title={gifts.join("\n")}
          >
            {gifts.join(" · ")}
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-bold",
              energy !== null && energy < entry.energyCost
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-gold/40 bg-gold/10 text-gold",
            )}
            title={wasHint ?? undefined}
          >
            <Zap className="h-2.5 w-2.5" />
            {entry.energyCost}
          </span>
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary/40 px-1.5 py-0 text-[10px] font-bold text-muted-foreground"
            title={wasHint ?? undefined}
          >
            <Timer className="h-2.5 w-2.5" />
            {t("braid.spell_cd", { n: entry.cooldownMinutes })}
          </span>
        </div>
      </div>

      {/* Колонка справа, узкая: «Читать» и под ним «Забыть». Ширина своя, не
          от тела, — на десктопе в две колонки тело сжимается, а кнопки нет. */}
      <div className="flex w-16 shrink-0 flex-col border-l border-border/60">
        <button
          type="button"
          onClick={onCast}
          disabled={readOnly || locked || busy}
          aria-label={block ? block.text : t("braid.spell_cast")}
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wide transition",
            locked
              ? "cursor-not-allowed bg-secondary/40 text-muted-foreground"
              : "gradient-gold text-gold-foreground",
          )}
        >
          {busy && !locked ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : block ? (
            <span className="line-clamp-2 text-center leading-tight">{block.text}</span>
          ) : busy ? (
            t("braid.spell_casting")
          ) : (
            t("braid.spell_cast")
          )}
        </button>
        {onForget && (
          <button
            type="button"
            onClick={onForget}
            disabled={busy}
            className="flex h-7 shrink-0 items-center justify-center gap-1 border-t border-border/60 bg-secondary/40 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground disabled:opacity-50"
          >
            <BookMinus className="h-3 w-3 shrink-0" />
            {t("braid.spell_forget")}
          </button>
        )}
      </div>
    </article>
  );
}
