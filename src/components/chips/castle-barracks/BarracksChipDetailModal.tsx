// Карточка фишки в Казарме замка (дизайн Ангелины, 07.10.2026; только админы).
// Действия те же, что у карточки игроков (ChipDetailModal): улучшение и герой;
// плюс «Продать» — выставление на рынок за золото (снова с 21.10.2026). Вывод
// фишки в NFT убран словом владельца 17.10.2026.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import type { ChipUpgradeState } from "@/lib/chips/upgradeBlock";
import { cn } from "@/lib/utils";
import { getTirageBonusEnabled, listChipCollectionsPublic } from "@/server/api/chips-stake";
import { CRAFT_RULES } from "@/server/api/chips-craft";
import { getSession } from "@/server/api/user-auth";
import { convertRuleForChipLevel } from "@/lib/heroLevels";
import { levelKey } from "@/components/chips/collectionsHelpers";
import { SingleChipCraftModal } from "@/components/chips/SingleChipCraftModal";
import { useCraftGoldPrice } from "@/components/chips/useCraftGoldPrice";
import { goldAtMultiplier } from "@/lib/craftGold";
import { useResources } from "@/lib/hooks/useResources";
import { chipBusyView } from "@/components/chips/chipBusy";
import { CastleConvertToHeroModal } from "@/components/castle-live/CastleConvertToHeroModal";
import { MarketCreateListing } from "@/components/chips/castle-market/MarketCreateListing";
import { BarracksChipDetailView } from "./BarracksChipDetailView";

type Template = { id: string; templateNo: number; name: string; imageUrl: string; collectionId: string; collectionName: string };
type Chip = { id: string; level: number; obtainedAt: string; serialNo: number | null; restUntil?: string | null };

export function BarracksChipDetailModal({ chipId, template, chips, stunUntil, upgradeStates, onClose }: {
  chipId: string;
  template: Template;
  chips: Chip[];
  stunUntil?: string | null;
  upgradeStates?: Record<string, ChipUpgradeState>;
  onClose: () => void;
}) {
  const t = useT();
  const [confirmedChip, setConfirmedChip] = useState<Chip | null>(null);
  const activeChipId = confirmedChip?.id ?? chipId;
  const loadedChip = chips.find((c) => c.id === activeChipId);
  // Craft creates a new inventory row. Keep its confirmed result visible until the query refreshes.
  const chip = loadedChip && confirmedChip && loadedChip.level < confirmedChip.level
    ? confirmedChip
    : loadedChip ?? confirmedChip;
  const [craftOpen, setCraftOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const nestedOpenRef = useRef(false);
  onCloseRef.current = onClose;
  nestedOpenRef.current = craftOpen || heroOpen || sellOpen;
  // Фокус внутри окна и Escape — пока не открыто вложенное окно.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (nestedOpenRef.current) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previouslyFocused?.focus(); };
  }, []);
  // Превращение в героя — по тому же флагу, что у карточки игроков.
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const heroRule = chip ? convertRuleForChipLevel(chip.level) : null;
  const canHero = !!session.data?.features?.heroes && !!heroRule;
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const busy = chipBusyView({ restUntil: chip?.restUntil, stunUntil: confirmedChip ? null : stunUntil }, nowTick, t);
  const resting = busy?.kind === "rest";
  const collectionsQ = useQuery({ queryKey: ["chip-collections-public"], queryFn: () => listChipCollectionsPublic(), staleTime: 300_000 });
  const bonusQuery = useQuery({ queryKey: ["tirage-bonus-enabled"], queryFn: () => getTirageBonusEnabled(), staleTime: 60_000 });
  const collection = collectionsQ.data?.find((c) => c.id === template.collectionId);
  // Улучшение — за золото по текущему курсу: стандарт × множитель с сервера.
  const goldMult = useCraftGoldPrice().data?.multiplier ?? null;
  const goldNow = useResources().data?.gold;
  if (!chip) return null;
  const isMax = chip.level >= 5;
  const rule = CRAFT_RULES[levelKey(chip.level)];

  return (
    <>
      <div className={cn("barracks-main-chip-modal fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center", craftOpen && "is-upgrading")} onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={template.name}
          tabIndex={-1}
          className="barracks-detail-panel relative mx-auto max-h-[calc(100dvh-80px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-gold/30 bg-card/95 pb-[calc(env(safe-area-inset-bottom)+84px)] backdrop-blur-xl sm:max-h-[92vh] sm:rounded-3xl sm:pb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <BarracksChipDetailView
            template={template}
            chip={chip}
            supply={collection?.initialSupply}
            isPremium={collection?.isPremium ?? false}
            bonusEnabled={collectionsQ.isLoading ? undefined : bonusQuery.data}
            bonusError={bonusQuery.isError || collectionsQ.isError || (!collectionsQ.isLoading && !collection)}
            onBonusRetry={() => { void bonusQuery.refetch(); void collectionsQ.refetch(); }}
            busy={busy}
            resting={resting}
            restLeft={busy?.left ?? ""}
            isMax={isMax}
            upgradeCost={rule && goldMult != null ? goldAtMultiplier(rule.costGold, goldMult) : null}
            goldMult={goldMult}
            haveGold={typeof goldNow === "number" ? goldNow : null}
            upgradeState={upgradeStates?.[chip.id]}
            heroLikes={canHero ? heroRule?.likes ?? null : null}
            onCraft={() => setCraftOpen(true)}
            onHero={() => setHeroOpen(true)}
            sellDisabled={Boolean(busy)}
            onSell={() => setSellOpen(true)}
            onClose={onClose}
          />
        </div>
      </div>
      {/* Карточка фишки в замке стоит на слое 110 (barracks.css), окна действий —
          на 50: без этой обёртки «Улучшить» открывало окно под карточкой. */}
      <div className="barracks-chip-nested">
      {craftOpen && <SingleChipCraftModal chipId={chip.id} chipLevel={chip.level} template={template} onClose={() => setCraftOpen(false)} onCrafted={(newChipId, newLevel) => { setConfirmedChip({ ...chip, id: newChipId, level: newLevel }); setCraftOpen(false); }} />}
      {heroOpen && <CastleConvertToHeroModal chipId={chip.id} chipLevel={chip.level} chipName={template.name} chipImageUrl={template.imageUrl} onClose={() => setHeroOpen(false)} onResultClose={onClose} />}
      {sellOpen && <MarketCreateListing initialChipId={chip.id} onClose={() => setSellOpen(false)} onListed={onClose} />}
      </div>
    </>
  );
}
