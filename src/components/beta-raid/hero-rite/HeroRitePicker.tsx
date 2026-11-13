// Выбор героев для обряда поверх окна постройки: свои свободные герои нужной
// редкости (не основной, не на грядке, не рыбачит — как у ломбарда), сетка, тап —
// отметить/снять, не больше, чем просит обряд. Снизу «n из N» и «Подтвердить».
// Оболочка — как у выбора артефакта (EnchantArtPicker): порталом в body, z-140.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { HeroRiteRarity } from "@/lib/enchant/heroRite";
import { useRiteHeroes } from "@/components/beta-raid/hero-rite/heroRiteQueries";
import { RiteHeroCell } from "@/components/beta-raid/hero-rite/HeroRiteBits";

export function HeroRitePicker({
  rarity,
  need,
  value,
  onPick,
  onClose,
}: {
  rarity: HeroRiteRarity;
  need: number;
  /** Уже выбранные копии (itemId). */
  value: string[];
  onPick: (ids: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const heroes = useRiteHeroes(rarity, true);
  const list = heroes.data ?? [];
  const [sel, setSel] = useState<string[]>(value);
  const live = sel.filter((id) => list.some((h) => h.itemId === id));
  const toggle = (id: string) =>
    setSel((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < need ? [...cur, id] : cur,
    );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="ench-pick fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("herorite.heroes")}
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">
            {t("herorite.heroes")} · {t(`herorite.r_${rarity}`)}
          </h4>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {heroes.isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : heroes.isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("enchantshop.arts_error")}</p>
              <button
                type="button"
                onClick={() => void heroes.refetch()}
                disabled={heroes.isFetching}
                className="flex items-center gap-1.5 rounded-xl border border-gold/60 px-4 py-2 text-sm font-bold text-gold disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" />
                {t("enchantshop.retry")}
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("herorite.pick_none")}
            </p>
          ) : (
            <div className="ench-pick-grid">
              {list.map((h) => (
                <RiteHeroCell
                  key={h.itemId}
                  h={h}
                  pressed={live.includes(h.itemId)}
                  onClick={() => toggle(h.itemId)}
                />
              ))}
            </div>
          )}
        </div>

        {live.length > 0 && (
          <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <button
              type="button"
              onClick={() => {
                onPick(live);
                onClose();
              }}
              className="ench-go"
            >
              <Check className="h-4 w-4" />
              {t("enchantshop.confirm")} · {t("herorite.picked", { n: live.length, need })}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
