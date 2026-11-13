import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Clock3, Gem, MapPin, Mountain, Sprout, TreePine, Wheat } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatQty } from "@/lib/formatQty";
import { mineRowReady, lostMarkKey } from "@/lib/mineLost";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import type { HarvestField } from "@/server/api/beta-raid/harvest-fields";
import logsArt from "@/assets/harvest/logs.webp";
import wheatArt from "@/assets/harvest/wheat.webp";

const stoneArt = "/resources/stone.png";
const goldArt = "/resources/gold.png";
const diamondsArt = "/resources/crystal.png";

export function HarvestIncomeStrip({
  mines,
  fields,
  now,
  onShowCell,
  action,
}: {
  mines: MineRow[];
  fields: HarvestField[];
  now?: number;
  onShowCell?: (q: number, r: number) => void;
  action?: ReactNode;
}) {
  const t = useT();
  const rail = useRef<HTMLDivElement>(null);
  const [hasMoreRight, setHasMoreRight] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [scrollHintDismissed, setScrollHintDismissed] = useState(false);
  const check = useCallback(() => {
    const el = rail.current;
    const contentWidth = el?.firstElementChild?.getBoundingClientRect().width ?? 0;
    const overflow = !!el && contentWidth > el.clientWidth + 3;
    if (!overflow && el?.scrollLeft) el.scrollLeft = 0;
    const moreRight = !!el && overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 3;
    setHasMoreRight(moreRight);
    setShowScrollHint(moreRight && !scrollHintDismissed && el.scrollLeft < 3);
  }, [scrollHintDismissed]);
  const turnPage = () => {
    const el = rail.current;
    if (!el) return;
    setScrollHintDismissed(true);
    const firstTile = el.firstElementChild?.firstElementChild;
    const step = firstTile?.getBoundingClientRect().width ?? 142;
    el.scrollBy({ left: step, behavior: "smooth" });
  };
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [check, mines.length, fields.length]);

  const entries = [
    ...mines.map((mine) => ({ kind: "mine" as const, q: mine.q, r: mine.r, mine })),
    ...fields.map((field) => ({ kind: "field" as const, q: field.q, r: field.r, field })),
  ];
  const nameForResource = (resource: string, token: string | null) => {
    if (resource === "token") return token ?? resource;
    const key = `mine.res.${resource}`;
    const translated = t(key);
    return translated === key ? resource : translated;
  };

  return (
    <section
      data-harvest-income
      className="rounded-[22px] border border-[#8a714e]/55 bg-[#151719] p-2.5 shadow-inner"
    >
      <h4 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-[#e4dccf]">
        <Clock3 className="h-4 w-4 text-[#c59d62]" />
        {t("harvest.income_title")}
      </h4>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-white/10 px-3 py-5 text-center text-xs text-muted-foreground">
          {t("harvest.no_income")}
        </p>
      ) : (
        <div
          data-harvest-rail
          data-harvest-more-right={hasMoreRight || undefined}
          className="relative rounded-2xl border border-white/10 bg-black/15"
        >
          <div
            data-harvest-viewport
            ref={rail}
            onScroll={() => {
              if ((rail.current?.scrollLeft ?? 0) > 3) setScrollHintDismissed(true);
              check();
            }}
            className="overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div data-harvest-track className="flex min-w-max items-stretch py-2">
              {entries.map((entry, index) => {
                const isMine = entry.kind === "mine";
                const mine = isMine ? entry.mine : null;
                const field = isMine ? null : entry.field;
                const resource =
                  mine?.resource ??
                  (field?.reward.kind === "item" ? "item" : (field?.reward.resource ?? "custom"));
                const name = mine
                  ? nameForResource(mine.resource, mine.token)
                  : field?.reward.kind === "item"
                    ? field.reward.name
                    : nameForResource(
                        field?.reward.resource ?? "custom",
                        field?.reward.token ?? null,
                      );
                // Алмаз острова платит раз в сутки — выход тоже в сутки.
                const perDay = mine?.stepHours === 24;
                const rate = perDay
                  ? (mine?.yield ?? 0) * 24
                  : (mine?.yield ?? field?.perHour ?? 0);
                const hasShelfStock = (field?.stored ?? 0) > 0;
                // Отнятая шахта (§8.71) — сумма её строки журнала, выхода нет.
                const accrued = mine
                  ? mineRowReady(mine, now)
                  : hasShelfStock
                    ? (field?.stored ?? 0)
                    : (field?.ready ?? 0);
                const Icon =
                  resource === "wood"
                    ? TreePine
                    : resource === "stone"
                      ? Mountain
                      : resource === "diamonds"
                        ? Gem
                        : field
                          ? Wheat
                          : Sprout;
                const image =
                  resource === "wood"
                    ? logsArt
                    : resource === "stone"
                      ? stoneArt
                      : resource === "gold"
                        ? goldArt
                        : resource === "diamonds"
                          ? diamondsArt
                          : field?.reward.kind === "item"
                            ? (field.reward.image ??
                              (/пшениц|wheat/i.test(field.reward.name) ? wheatArt : null))
                            : null;
                return (
                  <div
                    key={mine?.lost?.id ?? `${entry.kind}-${entry.q}-${entry.r}`}
                    className="flex"
                  >
                    {index > 0 && (
                      <div data-harvest-divider className="my-2 w-px bg-[#9c8460]/45" />
                    )}
                    <div
                      data-harvest-tile
                      data-harvest-long-name={name.length > 24 || undefined}
                      className="flex w-[172px] items-center gap-2 px-3 py-1"
                    >
                      {image ? (
                        <img src={image} alt="" className="h-10 w-10 shrink-0 object-contain" />
                      ) : (
                        <Icon
                          aria-hidden
                          className="h-9 w-9 shrink-0 text-[#d5aa58]"
                          strokeWidth={1.4}
                        />
                      )}
                      <div className="min-w-0 leading-tight">
                        <div data-harvest-heading className="flex items-center gap-1">
                          <span className="inline-block rounded-full border border-[#735631]/45 bg-[#59452b]/25 px-2 py-0.5 text-[10px] text-[#c8ae88]">
                            {t(isMine ? "harvest.mine_singular" : "harvest.field_singular")}
                          </span>
                          {onShowCell && (
                            <button
                              data-harvest-show-cell
                              type="button"
                              title={t("harvest.show_on_map")}
                              aria-label={`${name}: ${t("harvest.show_on_map")}, ${t("harvest.cell", { q: entry.q, r: entry.r })}`}
                              onClick={() => onShowCell(entry.q, entry.r)}
                              className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#d9b979] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e8bd6b]"
                            >
                              <MapPin aria-hidden className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div
                          className="mt-1 min-w-0 break-words text-sm font-semibold text-[#f0e8db]"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {name.charAt(0).toLocaleUpperCase() + name.slice(1)}
                        </div>
                        <div data-harvest-rate className="tabular-nums">
                          {mine?.lost
                            ? t(lostMarkKey(mine.lost.kind))
                            : `${formatQty(rate)}${t(perDay ? "mine2.day_suffix" : "harvest.rate_suffix")}`}
                        </div>
                        <div
                          data-harvest-amount
                          data-source-kind={entry.kind}
                          className="whitespace-nowrap tabular-nums"
                        >
                          <span>
                            {t(
                              mine
                                ? "harvest.accrued_label"
                                : hasShelfStock
                                  ? "harvest.on_shelf_label"
                                  : "harvest.ready_label",
                            )}
                          </span>
                          <strong>{formatQty(accrued)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {showScrollHint && (
            <button
              data-harvest-arrow="next"
              data-game-button="icon"
              type="button"
              aria-label={t("harvest.scroll_next")}
              onClick={turnPage}
              className="grid place-items-center"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
      {action && <div className="mt-2.5">{action}</div>}
    </section>
  );
}
