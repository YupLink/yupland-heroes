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
import { ArtWearBar } from "@/components/ArtWearBar";
import { RarityBadge } from "@/components/beta-raid/economy/EconomyRarity";
import { heroRarityByLevel } from "./artAnyIcon";
import { LAND_REBUILD_ENERGY } from "@/lib/landPlace";
import {itemInfoContent} from './itemInfoContent';

export function ItemInfoModal({
  id,
  onClose,
  layer = "z-[70]",
  fullName,
}: {
  id: string;
  onClose: () => void;
  /** Слой поверх окна, из которого открыли: у окон HUD свой z (110). */
  layer?: string;
  fullName?: string;
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
  // У шаблона героя колонка rarity пуста — редкость по ярусу (как у ломбарда):
  // без этого в окне героя из лавки её не было вовсе (владелец, 23.10.2026).
  const heroTier = it?.kind === "hero" && !it.rarity ? heroRarityByLevel(it.level) : null;
  const summary = it ? artifactSummary(it, lang).split("\n").filter(Boolean) : [];
  const num = (n: number) => n.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  // Кроме имени и картинки карточке есть что сказать? Своему товару без
  // описания — нечего, и вместо пустой шторки честнее так и написать.
  const hasAny = itemInfoContent(it, lang).hasDetails;

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
          <b className={fullName?"flex-1 min-w-0 whitespace-normal break-words":"flex-1 truncate"}>{fullName ?? it?.name ?? t("market.item_info")}</b>
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
              <div className="relative mx-auto w-32 overflow-hidden rounded-2xl">
                <img
                  src={thumb(it.imageUrl, 240, "black")}
                  alt=""
                  className="aspect-square w-full rounded-2xl border border-border/60 object-contain"
                />
                {/* Витрина продаёт новые артефакты — полоса полная. */}
                {it.kind === "artifact" && <ArtWearBar durability={100} />}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-1 text-[10px]">
              {heroTier ? (
                <RarityBadge
                  rarity={heroTier}
                  label={metaLabel(heroTier, lang)}
                  className="rounded-full px-2 py-0.5 normal-case tracking-normal"
                />
              ) : (
                it.rarity && (
                  <span className="rounded-full border border-gold/40 px-2 py-0.5 text-gold">
                    {metaLabel(it.rarity, lang)}
                  </span>
                )
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

            {/* Земля из лавки (мир строителей): сколько энергии стоит клетка. */}
            {it.kind === "terrain" && (
              <p className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-center text-xs font-bold text-gold">
                {t("land.info_energy", { n: LAND_REBUILD_ENERGY })}
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


