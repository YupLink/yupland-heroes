import type { KeySet } from "./fogMask";
import type { Landscape } from "./strategic-map/terrainGeometry";
import { lazy, memo, Suspense, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHomeCastle } from "@/server/api/beta-raid/home-castle";
import { toast } from "sonner";
import { ChevronUp, Plus, User, Gavel } from "lucide-react";
import { getSession } from "@/server/api/user-auth";
import { listAuctions } from "@/server/api/game-auction";
import { openAuction } from "@/lib/auctionBus";
import { AuctionCount } from "@/components/chips/auctions/AuctionCount";
import { useCastleMode } from "./castleMode";
import { RaidEnergyHud } from "./RaidEnergyHud";
import { RaidEffectsHud } from "./RaidEffectsHud";
import { useT, useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { RaidMapNavigation, RaidMiniMapButton } from "./RaidMapNavigation";
import { RaidQuickAccess } from "./RaidQuickAccess";
import { RaidLivePresetQuickAccess } from "./gear/RaidLivePresetQuickAccess";
import { SatietyBar, satietyLabel, useSatiety } from "./SatietyBar";
import "./raid-hero-group.css";
const HeroQuickModal = lazy(() => import("./HeroQuickModal").then(m => ({ default: m.HeroQuickModal })));
import type { RaidHeroUi } from "./useRaidHeroUi";
import { HUD_ART } from "@/lib/gameArt";
import { HudRoundButton } from "./HudRoundButton";
import { HarvestModal } from "./hud/HarvestModal";
import { GiftsModal } from "./hud/GiftsModal";
import type { MyGift } from "@/server/api/gifts";
import { useHarvest, useGifts } from "./hud/useHarvest";
import { MainToolBadge } from "./tool/MainToolBadge";
import { FishingButton } from "./fishing/FishingButton";
import { RaidLowerActions } from "./RaidLowerActions";
import { IslandAdminButton } from "./island/IslandAdminButton";
import "./raid-hud-art.css";

function Hud({
  seen,
  landscape,
  playerQ,
  playerR,
  castle,
  castleShown,
  centerQ,
  c0q,
  walking,
  onStop,
  onCenter,
  onLook,
  onShowCell,
  heroAvatarUrl,
  heroSprite,
  onPickHero,
  hero,
  onOpenGiftPack,
}: {
  seen: KeySet;
  landscape?: Landscape;
  playerQ: number | null;
  playerR: number | null;
  castle: { q: number; r: number };
  /** На другом этаже замка нет — ни кнопки, ни метки на миникарте. */
  castleShown: boolean;
  /** Точка отсчёта гекс-сетки — прокидываем в миникарту. */
  centerQ: number;
  c0q: number;
  walking?: boolean;
  /** Встать посреди маршрута: тот же кружок героя во время ходьбы. */
  onStop?: () => void;
  /** Камера к герою — со следованием. */
  onCenter: (q: number, r: number) => void;
  /** Камера к точке (замок, миникарта) — стоит там, пока герой не пойдёт новым маршрутом. */
  onLook: (q: number, r: number) => void;
  /** Показать клетку: камера едет туда и клетка вспыхивает на полторы секунды. */
  onShowCell?: (q: number, r: number) => void;
  /** Аватар выбранного героя — он же кнопка выбора основного героя. */
  heroAvatarUrl?: string | null;
  heroSprite?: string | null;
  /** Открыть выбор героя — только пока режим героя выключен. */
  onPickHero?: () => void;
  /** Режим героя; без него кнопки замка нет и подпись прежняя. */
  hero?: RaidHeroUi;
  onOpenGiftPack?: (gift: MyGift) => void;
}) {
  const t = useT();
  const lang = useLang();
  // Два кружка под мини-картой. Верхний — «Добыча»: шахты, поля и очередь
  // наград, которые раньше висели плашками НАД картой и съедали её высоту.
  // Нижний — «Подарки»: он появляется, только когда подарок есть.
  const [open, setOpen] = useState<null | "harvest" | "gifts">(null);
  const [rightOpen, setRightOpen] = useState(false);
  const harvest = useHarvest();
  const gifts = useGifts();
  // Аукционы за флагом `auctions`: кружок админу виден всегда (вход и создание
  // первого лота), игроку — когда есть живой лот. Запрос только при флаге.
  const auctionSession = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const auctionsOn = !!(auctionSession.data as { features?: Record<string, boolean> } | undefined)?.features?.auctions;
  const auctionAdmin = !!auctionSession.data?.isAdmin;
  const auctionsLive = useQuery({
    queryKey: ["auctions", "live"],
    queryFn: () => listAuctions(),
    enabled: auctionsOn,
    refetchInterval: 30_000,
  });
  const auctionCount = auctionsLive.data?.auctions?.length ?? 0;
  const showAuction = auctionsOn && (auctionAdmin || auctionCount > 0);
  const castleMode = useCastleMode();
  const satiety = useSatiety();
  const [heroOpen, setHeroOpen] = useState(false);
  const homeStatus = useQuery({ queryKey: ["home-castle"], queryFn: () => getHomeCastle(), enabled: !!castleMode });
  // «У замка ли я» — когда герой остановился, а не на каждый шаг: запрос на
  // шаг удваивал нагрузку (446 тыс. в сутки, как и самих шагов, 11.10.2026).
  useEffect(() => {
    if (!castleMode) return;
    const id = setTimeout(() => void homeStatus.refetch(), 700);
    return () => clearTimeout(id);
  }, [playerQ, playerR, !!castleMode, homeStatus.refetch]);
  const entering = castleMode ? homeStatus.isSuccess && !homeStatus.isFetching && !!homeStatus.data?.here : !!hero?.atCastle;
  // Кнопка героя (справа сверху) — как раньше внизу: первое нажатие везёт
  // камеру к герою, второе (камера уже у него) открывает окно героя
  // (владелец, 09.10.2026: «нет центрирования на герое»).
  const aimed = useRef({ cell: "", at: 0 });
  const onHero = () => {
    if (playerQ == null || playerR == null) return setHeroOpen(true);
    const cell = `${playerQ},${playerR}`;
    if (aimed.current.cell === cell && Date.now() - aimed.current.at < 10_000) return setHeroOpen(true);
    aimed.current = { cell, at: Date.now() };
    onCenter(playerQ, playerR);
  };
  const closeHero = () => {
    setHeroOpen(false);
    aimed.current.at = Date.now();
  };
  const onCenterHero = () => { if (playerQ != null && playerR != null) onCenter(playerQ, playerR); };
  const onEnter = () => castleMode ? castleMode.enter() : hero?.openCastle();
  const onShowHome = () => {
    // Camera navigation uses coordinates already loaded for the HUD. It must
    // not wait for a network refetch; entering the castle still checks access.
    const home = homeStatus.data?.home ?? castleMode?.home ?? castle;
    if (home && Number.isFinite(home.q) && Number.isFinite(home.r)) {
      onLook(home.q, home.r);
      return true;
    }
    toast.error(lang === "ru" ? "Не удалось определить положение замка. Попробуй ещё раз." : "Could not locate the castle. Try again.");
    return false;
  };
  return (
    <>
      {/* Из замка: профиль (с Казной) — всегда под рукой, в правом верхнем углу;
          миникарта и кружки под ним. */}
      <div className={castleMode ? "raid-hero-group" : "contents"}>
      {castleMode && (
        <>
          <div data-hud-top className="raid-hero-group__energy">
            <RaidEnergyHud ru={lang === "ru"} />
          </div>
          
        </>
      )}
      <div className={castleMode ? "raid-hero-group__portrait" : "contents"}>
        {castleMode && <SatietyBar ru={lang === "ru"} variant="ring" />}
        <button
          type="button"
          data-hud-top
          onClick={onHero}
          title={castleMode && satiety ? satietyLabel(satiety, lang === "ru") : undefined}
          aria-label={lang === "ru" ? "Герой: к герою, ещё раз — открыть" : "Hero: center, tap again to open"}
          className={cn(
            "z-30 grid place-items-center overflow-hidden rounded-full border-2 border-gold/70 bg-black/80 text-gold",
            castleMode ? "raid-hero-group__portrait-button" : "absolute right-2 top-2 h-14 w-14",
          )}
        >
          {heroAvatarUrl ? <img src={heroAvatarUrl} alt="" className="h-full w-full object-cover" /> : <User aria-hidden="true" />}
        </button>
      </div>
      {!castleMode && (
        <div data-hud-top data-hud-right className="pointer-events-none absolute right-2 top-[68px] z-30 w-24">
          <SatietyBar ru={lang === "ru"} variant="compact" />
        </div>
      )}
      </div>
      <Suspense fallback={null}>{heroOpen && <HeroQuickModal onClose={closeHero} onProfile={castleMode?.openProfile ? () => { setHeroOpen(false); castleMode.openProfile?.(); } : undefined} />}</Suspense>
      <div data-hud-right className="raid-right-menu">
        <button type="button" className="raid-right-menu__toggle" aria-label={lang === "ru" ? rightOpen ? "Свернуть действия" : "Показать действия" : rightOpen ? "Collapse actions" : "Show actions"} aria-expanded={rightOpen} aria-controls="raid-right-menu-items" onClick={() => setRightOpen(value => !value)}>
          {rightOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {!rightOpen && auctionsOn && <AuctionCount n={auctionCount} />}
        </button>
        {rightOpen && <div id="raid-right-menu-items" className="raid-right-menu__items">
          <RaidQuickAccess ru={lang === "ru"} entry="spells" />
          <RaidMiniMapButton ru={lang === "ru"} art="/resources/raid-hud-art-map.webp" map={{ seen, landscape, playerQ, playerR, castle, castleShown, centerQ, c0q, onPick: onShowCell ?? onLook }} />
          <HudRoundButton art="/resources/raid-hud-art-pickaxe.webp" count={harvest.count} label={t("harvest.title")} hud="harvest" onClick={() => setOpen("harvest")} />
          {gifts.count > 0 && <HudRoundButton art="/resources/raid-hud-art-gift.webp" count={gifts.count} label={t("gifts.title")} tone="gift" pulse onClick={() => setOpen("gifts")} />}
          {showAuction && <HudRoundButton icon={<Gavel className="h-5 w-5" />} count={auctionCount} tone="camp" label={lang === "ru" ? "Аукционы" : "Auctions"} onClick={() => openAuction()} />}
          {auctionAdmin && <IslandAdminButton />}
        </div>}
      </div>

      {open === "harvest" && (
        <HarvestModal
          onClose={() => setOpen(null)}
          onShowCell={
            onShowCell &&
            ((q, r) => {
              // Окно закрываем сами: игрок просил показать клетку, а не читать
              // список поверх неё.
              setOpen(null);
              onShowCell(q, r);
            })
          }
        />
      )}
      {open === "gifts" && <GiftsModal gifts={gifts.gifts} onClose={() => setOpen(null)} onOpenPacks={onOpenGiftPack ? (gift) => { setOpen(null); onOpenGiftPack(gift); } : undefined} />}

      <div className={castleMode ? "raid-world-hud raid-hud-design" : "raid-hud-design"}><RaidMapNavigation ru={lang === "ru"} heroSprite={heroSprite} showCamera={false} castleImage="/resources/raid-hud-art-castle.webp"
        map={{ seen, landscape, playerQ, playerR, castle, castleShown, centerQ, c0q, onPick: onShowCell ?? onLook }}
        atCastle={entering} showCastle={castleShown} walking={false} onStop={onStop}
        canCenter={playerQ != null && playerR != null} onCenter={onCenterHero}
        onEnterCastle={onEnter} onShowCastle={onShowHome}
        effects={castleMode ? <RaidEffectsHud ru={lang === "ru"} /> : undefined}
        toolAction={<RaidLowerActions ru={lang === "ru"} heroSprite={heroSprite} walking={walking} canCenter={playerQ != null && playerR != null} onCenter={onCenterHero} onStop={onStop}
          hand={<MainToolBadge />}
          backpack={<RaidQuickAccess ru={lang === "ru"} entry="backpack" />}
          presets={<RaidLivePresetQuickAccess ru={lang === "ru"} atCastle={entering} />}
          action={walking ? null : <FishingButton q={playerQ} r={playerR} />}
        />}
      /></div>
    </>
  );
}

// Слой живёт поверх канваса, который перерисовывается каждый кадр камеры.
export const BetaRaidHud = memo(Hud);



