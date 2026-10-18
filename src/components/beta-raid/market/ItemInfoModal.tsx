// Карточка предмета: подробности того, что даёт арт.
//
// Тут ровно те же строки, что покупатель увидит на предмете в инвентаре —
// повторное использование artifactSummary держит формулировки одинаковыми.
// Пример: «Броня: 5» / «Специализация: Строитель (+1 Броня)» / «Иммунитет: …».
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT, useLang } from "@/lib/i18n";
import { getItemInfo } from "@/server/api/beta-raid/item-info";
import { artifactSummary } from "@/components/artifactSummary";
import { metaLabel } from "@/components/heroMeta";
import { BetaAbilityBadges } from "../BetaAbilityBadges";
import { boostListText } from "@/lib/hero/boost";

export function ItemInfoModal({
  id,
  onClose,
  layer = "z-[70]",
}: {
  id: string;
  onClose: () => void;
  /** Слой поверх окна, из которого открыли: у окон HUD свой z (110). */
  layer?: string;
}) {
  const t = useT();
  const lang = useLang();
  const q = useQuery({
    queryKey: ["item-info", id],
    queryFn: () => getItemInfo({ data: { id } }),
    // Шаблон редко меняется, ответ маленький — держим его подольше.
    staleTime: 5 * 60_000,
    retry: false,
  });

  const it = q.data ?? null;
  const summary = it ? artifactSummary(it, lang).split("\n").filter(Boolean) : [];
  const num = (n: number) => n.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  // Кроме имени и картинки карточке есть что сказать? Своему товару без
  // описания — нечего, и вместо пустой шторки честнее так и написать.
  const hasAny =
    !!it &&
    (summary.length > 0 ||
      !!it.description ||
      it.hp != null ||
      !!it.damage ||
      it.abilities.length > 0 ||
      !!it.boost?.length ||
      !!it.rarity ||
      it.level != null ||
      !!it.slot);

  const body = (
    <div
      className={`fixed inset-0 ${layer} flex items-end justify-center bg-black/70 sm:items-center sm:p-4`}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <b className="flex-1 truncate">{it?.name ?? t("market.item_info")}</b>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {q.isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {q.error && (
          <p className="py-4 text-center text-xs text-destructive">{t("common.error")}</p>
        )}
        {it && (
          <div className="space-y-3">
            {it.imageUrl && (
              <img
                src={thumb(it.imageUrl, 240, "black")}
                alt=""
                className="mx-auto aspect-square w-32 rounded-2xl border border-border/60 object-contain"
              />
            )}

            <div className="flex flex-wrap justify-center gap-1 text-[10px]">
              {it.rarity && (
                <span className="rounded-full border border-gold/40 px-2 py-0.5 text-gold">
                  {metaLabel(it.rarity, lang)}
                </span>
              )}
              {it.level != null && (
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-muted-foreground">
                  {t("market.item_level", { n: it.level })}
                </span>
              )}
              {it.slot && (
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-muted-foreground">
                  {metaLabel(it.slot, lang)}
                </span>
              )}
              {it.hp != null && (
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-muted-foreground">
                  {t("market.item_hp")}: {num(it.hp)}
                </span>
              )}
              {it.damage && (
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-muted-foreground">
                  {t("market.item_damage")}: {it.damage}
                </span>
              )}
            </div>

            {/* Товар-буст: что он даёт герою. У обычных строки нет вовсе. */}
            {!!it.boost?.length && (
              <p className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-center text-xs font-bold text-gold">
                {boostListText(it.boost, lang === "en" ? "en" : "ru")}
              </p>
            )}

            {it.abilities.length > 0 && <BetaAbilityBadges abilities={it.abilities} />}

            {summary.length > 0 && (
              <ul className="space-y-1 rounded-2xl border border-border/60 bg-background/40 p-3 text-xs">
                {summary.map((line, i) => (
                  <li key={i} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            )}

            {it.description && (
              <p className="whitespace-pre-line rounded-2xl border border-border/60 bg-background/40 p-3 text-[11px] text-muted-foreground">
                {it.description}
              </p>
            )}

            {!hasAny && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                {t("market.item_no_details")}
              </p>
            )}

            {summary.length > 0 && (
              <p className="text-center text-[10px] text-muted-foreground">
                {t("market.item_info_hint")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
