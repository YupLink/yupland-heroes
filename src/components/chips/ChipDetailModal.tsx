import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { ChipImage } from "@/components/ChipImage";
import { TirageStatBlock } from "@/components/chips/TirageStats";
import { ChipCraftPath } from "@/components/chips/ChipCraftPath";
import { useCraftGoldPrice } from "@/components/chips/useCraftGoldPrice";
import { fmtGold, goldAtMultiplier } from "@/lib/craftGold";
import { useResources } from "@/lib/hooks/useResources";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { GoldRequiredLine, goldShort } from "@/components/chips/GoldPriceLine";
import { listChipCollectionsPublic } from "@/server/api/chips-stake";
import { CRAFT_RULES } from "@/server/api/chips-craft";
import { levelKey } from "@/components/chips/collectionsHelpers";
import { ConvertToHeroModal } from "@/components/heroes/ConvertToHeroModal";
import { getSession } from "@/server/api/user-auth";
import { convertRuleForChipLevel } from "@/lib/heroLevels";
import { SingleChipCraftModal } from "@/components/chips/SingleChipCraftModal";
import { MarketCreateListing } from "@/components/chips/castle-market/MarketCreateListing";
import { chipBusyView } from "@/components/chips/chipBusy";
import {
  ChipBusyBadge,
  ChipBusyNotice,
  chipBusyImageClass,
} from "@/components/chips/ChipBusyNotice";

import { thumb } from "@/lib/image";
function ChipDetailModal({
  chipId,
  template,
  chips,
  stunUntil,
  onClose,
}: {
  chipId: string;
  template: {
    id: string;
    templateNo: number;
    name: string;
    imageUrl: string;
    collectionId: string;
    collectionName: string;
  };
  chips: Array<{
    id: string;
    level: number;
    obtainedAt: string;
    serialNo: number | null;
    restUntil?: string | null;
  }>;
  /** Оглушение боссом: в getMyChipsForTemplate его нет, несём из инвентаря. */
  stunUntil?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const [confirmedChip, setConfirmedChip] = useState<(typeof chips)[number] | null>(null);
  const activeChipId = confirmedChip?.id ?? chipId;
  const loadedChip = chips.find((c) => c.id === activeChipId);
  // Craft creates a new inventory row. Keep its confirmed result visible until the query refreshes.
  const chip = loadedChip && confirmedChip && loadedChip.level < confirmedChip.level
    ? confirmedChip
    : loadedChip ?? confirmedChip;
  const [craftOpen, setCraftOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  // Превращение в героя пока тестируем только на админах (просьба владельца).
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const heroRule = chip ? convertRuleForChipLevel(chip.level) : null;
  const canHero = !!session.data?.features?.heroes && !!heroRule;
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  // Оглушение и отдых считает общий модуль: инвентарь, замок и карточка должны
  // говорить одно и то же и до минуты одинаково.
  const busy = chipBusyView({ restUntil: chip?.restUntil, stunUntil: confirmedChip ? null : stunUntil }, nowTick, t);
  // Кнопки крафта/героя гасит именно час отдыха — оглушение мешает бою,
  // а не мастерской, и запрет там был бы новым правилом.
  const resting = busy?.kind === "rest";
  const restLeft = busy?.left ?? "";
  const collectionsQ = useQuery({
    queryKey: ["chip-collections-public"],
    queryFn: () => listChipCollectionsPublic(),
    staleTime: 300_000,
  });
  const collection = collectionsQ.data?.find((c) => c.id === template.collectionId);
  const supply = collection?.initialSupply;
  // Улучшение — за золото по текущему курсу: стандарт × множитель с сервера.
  const goldMult = useCraftGoldPrice().data?.multiplier ?? null;
  const goldNow = useResources().data?.gold;
  if (!chip) return null;
  const isMax = chip.level >= 5;
  const rule = CRAFT_RULES[levelKey(chip.level)];
  const cost = rule && goldMult != null ? goldAtMultiplier(rule.costGold, goldMult) : null;
  const have = typeof goldNow === "number" ? goldNow : null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
        onClick={onClose}
      >
        <div
          className="relative mx-auto max-h-[calc(100dvh-80px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-gold/30 bg-card/95 pb-[calc(env(safe-area-inset-bottom)+84px)] backdrop-blur-xl sm:max-h-[92vh] sm:rounded-3xl sm:pb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <ChipImage
              src={thumb(template.imageUrl, 640)}
              level={chip.level}
              alt={template.name}
              className={cn("aspect-square w-full", chipBusyImageClass(busy))}
            />
            {busy && <ChipBusyBadge busy={busy} />}
            <span className="absolute left-3 top-3 inline-flex items-center justify-center rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold backdrop-blur">
              #{template.templateNo}
            </span>
            <span className="absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
              #{chip.serialNo ?? "?"}
            </span>
          </div>

          <div className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <div className="font-display text-lg font-bold">
                {template.name} {template.collectionName}
              </div>
              {collection?.isPremium && (
                <span className="shrink-0 rounded-full bg-purple-500/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Премиум
                </span>
              )}
            </div>
            <TirageStatBlock
              level={chip.level}
              isPremium={collection?.isPremium ?? false}
              supply={supply}
            />

            {!isMax && <ChipCraftPath level={chip.level} mult={goldMult} />}

            {busy && <ChipBusyNotice busy={busy} />}

            {/* «Продать» — выставить на Маркет за золото (снова с 21.10.2026). */}
            {!isMax && <GoldRequiredLine className="flex items-center gap-1 pt-1 text-xs text-amber-300" need={cost} have={have} />}
            <div className="flex gap-2 pt-2">
              <button type="button" disabled={!!busy} onClick={() => setSellOpen(true)} className="flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-medium transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40">
                {t("chips.sell")}
              </button>
              {isMax ? (
                <button
                  type="button"
                  disabled
                  className="flex-1 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs font-bold text-amber-400"
                >
                  MAX
                </button>
              ) : (
                <button
                  type="button"
                  disabled={resting || goldShort(cost, have)}
                  onClick={() => setCraftOpen(true)}
                  aria-label={!resting && cost != null ? t("chips.upgrade_for", { n: fmtGold(cost, ru) }) : undefined}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2.5 text-xs font-bold text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] transition hover:scale-[1.02] hover:bg-rose-400 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  {resting
                    ? `Отдых · ${restLeft}`
                    : <>
                        {t("chips.upgrade")}
                        {cost != null && <><ResourceGlyph kind="gold" /> {fmtGold(cost, ru)}</>}
                      </>}
                </button>
              )}
            </div>
            {canHero && (
              <button
                type="button"
                disabled={resting}
                onClick={() => setHeroOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/50 bg-gold/10 px-3 py-2.5 text-xs font-bold text-gold transition hover:bg-gold/15 disabled:pointer-events-none disabled:opacity-40"
              >
                <Crown className="h-3.5 w-3.5" />
                {resting ? `Отдых · ${restLeft}` : "Превратить в героя"}
                {!resting && heroRule && (
                  <span className="ml-0.5 opacity-80">· {heroRule.likes} лайков</span>
                )}
              </button>
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs font-medium transition hover:bg-secondary"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {sellOpen && <MarketCreateListing initialChipId={chip.id} onClose={() => setSellOpen(false)} onListed={onClose} />}
      {craftOpen && (
        <SingleChipCraftModal
          chipId={chip.id}
          chipLevel={chip.level}
          template={template}
          onClose={() => setCraftOpen(false)}
          onCrafted={(newChipId, newLevel) => {
            setConfirmedChip({ ...chip, id: newChipId, level: newLevel });
            setCraftOpen(false);
          }}
        />
      )}

      {heroOpen && (
        <ConvertToHeroModal
          chipId={chip.id}
          chipLevel={chip.level}
          chipName={template?.name ?? "Фишка"}
          onClose={() => {
            setHeroOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

export { ChipDetailModal };
