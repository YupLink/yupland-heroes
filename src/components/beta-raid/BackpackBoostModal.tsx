// Карточка товара-буста из рюкзака: что это и что он даст.
//
// Зачем окно, если есть клетка: на клетке помещается одна строка, а прибавок у
// зелья бывает несколько, и каждая со своим сроком. Владелец просил, чтобы
// игрок видел ОПИСАНИЕ и эффект до нажатия, а не узнавал их из тоста после.
//
// Раскладка снята с BackpackDiscardModal: снизу на телефоне, по центру на
// десктопе, с запасом под нижнюю панель приложения. Оттуда же счётчик: зелий
// можно выпить несколько разом, а не по одному нажатию на штуку.
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { Apple, Dumbbell, Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { boostEffectText, type BoostEffect } from "@/lib/hero/boost";
import { useQtyInput } from "@/hooks/useQtyInput";
import { QtyField } from "./QtyField";

export function BackpackBoostModal({
  name,
  image,
  total,
  effects,
  lang,
  busy,
  useAllowed = true,
  onUse,
  onClose,
}: {
  name: string;
  image: string | null;
  /** Сколько единиц вида лежит в рюкзаке. */
  total: number;
  effects: BoostEffect[];
  lang: "ru" | "en";
  busy: boolean;
  useAllowed?: boolean;
  onUse: (qty: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  // Выпить можно только целую штуку: дробный остаток (0,4 зелья) сервер не
  // отдаст, и кнопка не должна обещать обратного.
  const max = Math.floor(total);
  const q = useQtyInput({ max: Math.max(1, max), initial: 1, integer: true });
  // Еда — товар с сытостью: её съедают, и значок тот же, что у шкалы сытости.
  const food = effects.some((e) => e.stat === "satiety");
  const Icon = food ? Apple : Dumbbell;
  return (
    <ResourceActionDialog
      title={name}
      busy={busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      className="mb-[calc(env(safe-area-inset-bottom)+76px)] max-h-[80dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:max-h-[85vh] sm:rounded-3xl"
    >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40">
              {image ? (
                <img
                  src={thumb(image, 120, "black")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon className="h-5 w-5 text-gold" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("braid.boost_item_title")}
              </div>
              <h3 className="truncate font-display text-base font-bold">{name}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Каждая прибавка отдельной строкой: у зелья их бывает несколько, и в
            одну склеенную строку они на телефоне не помещаются. */}
        <div className="space-y-1 rounded-2xl border border-gold/30 bg-gold/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("braid.spell_gives")}
          </div>
          {effects.map((e, i) => (
            <p key={`${e.stat}-${i}`} className="text-xs font-bold leading-snug text-gold">
              {boostEffectText(e, lang)}
            </p>
          ))}
          {/* «Забвение N Lv» не временное — оно тратится забвениями; сытость (еда)
              — прибавка к шкале, тоже без срока. */}
          {effects.some((e) => e.stat !== "satiety" && (e.stat !== "oblivion" || !!e.minutes)) && (
            <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
              {t("braid.boost_item_temp")}
            </p>
          )}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("braid.boost_item_count", { n: q.fmt(total) })}
        </p>

        {max > 1 && (
          <QtyField q={q} className="mt-3">
            <button
              type="button"
              onClick={() => q.set(max)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold"
            >
              {t("braid.potion_all", { n: max })}
            </button>
          </QtyField>
        )}

        <button
          type="button"
          onClick={() => onUse(q.commit())}
          disabled={busy || !useAllowed || max < 1}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
          {food
            ? q.value > 1
              ? t("braid.boost_item_eat_n", { n: q.value })
              : t("braid.boost_item_eat")
            : q.value > 1
              ? t("braid.boost_item_use_n", { n: q.value })
              : t("braid.boost_item_use")}
        </button>
    </ResourceActionDialog>
  );
}
