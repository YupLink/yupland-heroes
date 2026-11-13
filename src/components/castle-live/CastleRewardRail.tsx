import { useAuctionUnread } from "@/components/trade/useAuctionUnread";
import { AuctionUnreadBadge } from "@/components/trade/AuctionUnreadBadge";
const buildArt = "/resources/castle-construction.webp";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { listAuctions } from "@/server/api/game-auction";
import { openTrade } from "@/lib/tradeBus";
import { createPortal } from "react-dom";
import { ChevronUp, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
const mineArt = "/resources/raid-hud-art-pickaxe.webp";
const giftArt = "/resources/raid-hud-art-gift.webp";
import { HarvestModal } from "@/components/beta-raid/hud/HarvestModal";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import { GiftsModal } from "@/components/beta-raid/hud/GiftsModal";
import { HudModal } from "@/components/beta-raid/hud/HudModal";
import { useHarvest, useGifts } from "@/components/beta-raid/hud/useHarvest";
import type { Lang } from "@/lib/store";
import type { MyGift } from "@/server/api/gifts";
import { onMineOfficeOpen } from "@/lib/mineOfficeBus";
import { MineOfficeModal } from "./mine-office/MineOfficeModal";
import { MINE_OFFICE_LOOK } from "./modularMineOffice";
import { useMineOfficeOwned } from "./useWithMineOffice";
import { tFor } from "@/lib/i18n";
import { onWeatherStationOpen } from "@/lib/weatherStationBus";
import { WeatherStationModal } from "./weather-station/WeatherStationModal";
import { WEATHER_STATION_LOOK } from "./modularWeatherStation";
import { useWeatherStationOwned } from "./useWithWeatherStation";
import { onShamanHutOpen } from "@/lib/shamanHutBus";
import { SHAMAN_ART } from "@/lib/shamanHut";
import { ShamanHutModal } from "./shaman-hut/ShamanHutModal";
import { useShamanHutOwned } from "./useWithShamanHut";
import "./castle-reward-rail.css";
import "./castle-action-menu.css";

/** Castle entry for existing harvest and gift actions; the route controls real vs preview data. */
export function CastleRewardRail({ lang, onGiftAction, onBuild }: { lang: Lang; onBuild?: () => void; onGiftAction?: (gift: MyGift) => void }) {
  const [open, setOpen] = useState<"harvest" | "gifts" | "mines" | "weather" | "shaman" | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const giftButton = useRef<HTMLButtonElement>(null);
  const harvestButton = useRef<HTMLButtonElement>(null);
  const minesButton = useRef<HTMLButtonElement>(null);
  const weatherButton = useRef<HTMLButtonElement>(null);
  const shamanButton = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef<typeof open>(null);
  useEffect(() => {
    if (!open && previousOpen.current === "gifts") (rightOpen ? giftButton.current : toggleButton.current)?.focus();
    if (!open && previousOpen.current === "harvest") (rightOpen ? harvestButton.current : toggleButton.current)?.focus();
    if (!open && previousOpen.current === "mines") (rightOpen ? minesButton.current : toggleButton.current)?.focus();
    if (!open && previousOpen.current === "weather") (rightOpen ? weatherButton.current : toggleButton.current)?.focus();
    if (!open && previousOpen.current === "shaman") (rightOpen ? shamanButton.current : toggleButton.current)?.focus();
    previousOpen.current = open;
  }, [open, rightOpen]);
  const harvest = useHarvest();
  // «Управление шахтами» (25.10.2026): иконка — только с построенным зданием
  // и только в замке (на карте рейда этой полосы нет); здание на площади
  // открывает то же окно шиной.
  const minesOffice = useMineOfficeOwned();
  useEffect(() => onMineOfficeOpen(() => setOpen("mines")), []);
  // «Метеостанция» (28.10.2026): так же — иконка со зданием, здание на площади — шиной.
  const weatherStation = useWeatherStationOwned();
  useEffect(() => onWeatherStationOpen(() => setOpen("weather")), []);
  // «Хижина шаманов» (28.10.2026): иконка — рисунок шамана, здание на площади — шиной.
  const shamanHut = useShamanHutOwned();
  useEffect(() => onShamanHutOpen(() => setOpen("shaman")), []);
  const gifts = useGifts();
  const ru = lang === "ru";
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  // Аукционы за флагом: в замке кружок всегда — там и аукционный дом игрока
  // (постройка, свои лоты); на карте игроку — только при живом лоте.
  const auctionsOn = !!(session.data as { features?: Record<string, boolean> } | undefined)?.features?.auctions;
  const auctionsLive = useQuery({
    queryKey: ["auctions", "live"],
    queryFn: () => listAuctions(),
    enabled: auctionsOn,
    refetchInterval: 30_000,
  });
  const { unreadCount } = useAuctionUnread();
  const auctionCount = auctionsLive.data?.auctions?.length ?? 0;
  const showAuction = auctionsOn;

  return (
    <>
      {!open && (
        <div
          className="castle-reward-rail"
          role="group"
          aria-label={ru ? "Награды замка" : "Castle rewards"}
        >
          <button ref={toggleButton} type="button" className="castle-reward-rail__toggle"
            aria-label={ru ? rightOpen ? "Свернуть действия" : "Показать действия" : rightOpen ? "Collapse actions" : "Show actions"}
            aria-expanded={rightOpen} aria-controls="castle-action-items" onClick={() => setRightOpen(value => !value)}>
            {rightOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {!rightOpen && auctionsOn && <AuctionUnreadBadge count={unreadCount} en={!ru} />}
          </button>
          <div id="castle-action-items" className="castle-reward-rail__items" data-open={rightOpen} inert={!rightOpen} aria-hidden={!rightOpen}>
          <button
            ref={harvestButton}
            type="button"
            aria-label={ru ? "Добыча" : "Harvest"}
            title={ru ? "Добыча" : "Harvest"}
            onClick={() => setOpen("harvest")}
          >
            <img src={mineArt} alt="" draggable={false} />
            <span className="castle-reward-rail__label">{ru ? "Добыча" : "Harvest"}</span>
            {harvest.count > 0 && (
              <span className="castle-reward-rail__badge" aria-hidden="true">
                {harvest.count > 99 ? "99+" : harvest.count}
              </span>
            )}
          </button>

          {minesOffice && (
            <button
              ref={minesButton}
              type="button"
              aria-label={ru ? "Управление шахтами" : "Mine management"}
              title={ru ? "Управление шахтами" : "Mine management"}
              onClick={() => setOpen("mines")}
            >
              <img src={MINE_OFFICE_LOOK} alt="" draggable={false} />
              <span className="castle-reward-rail__label">{ru ? "Шахты" : "Mines"}</span>
            </button>
          )}
          {weatherStation && (
            <button
              ref={weatherButton}
              type="button"
              aria-label={tFor(lang, "wstation.title")}
              title={tFor(lang, "wstation.title")}
              onClick={() => setOpen("weather")}
            >
              <img src={WEATHER_STATION_LOOK} alt="" draggable={false} />
              <span className="castle-reward-rail__label">{tFor(lang, "wstation.rail")}</span>
            </button>
          )}
          {shamanHut && (
            <button
              ref={shamanButton}
              type="button"
              aria-label={tFor(lang, "shaman.hut")}
              title={tFor(lang, "shaman.hut")}
              onClick={() => setOpen("shaman")}
            >
              <img src={SHAMAN_ART} alt="" draggable={false} />
              <span className="castle-reward-rail__label">{tFor(lang, "shaman.rail")}</span>
            </button>
          )}
          {gifts.count > 0 && <button
            ref={giftButton}
            type="button"
            aria-label={ru ? "Подарки" : "Gifts"}
            title={ru ? "Подарки" : "Gifts"}
            onClick={() => setOpen("gifts")}
          >
            <img src={giftArt} alt="" draggable={false} />
            <span className="castle-reward-rail__label">{ru ? "Подарки" : "Gifts"}</span>
            {gifts.count > 0 && (
              <span className="castle-reward-rail__badge" aria-hidden="true">
                {gifts.count > 99 ? "99+" : gifts.count}
              </span>
            )}
          </button>}
          {onBuild && <button type="button" aria-label={ru ? "Строительство" : "Construction"} title={ru ? "Строительство" : "Construction"} onClick={onBuild}><img src={buildArt} alt="" draggable={false} /><span className="castle-reward-rail__label">{ru ? "Строительство" : "Construction"}</span></button>}
          {(
            <button type="button" aria-label={ru ? "Торговля" : "Trade"} title={ru ? "Торговля" : "Trade"} onClick={() => openTrade({auctionAvailable:showAuction,auctionCount})}>
              <img src="/resources/trade-market.webp" alt="" draggable={false} />
              <span className="castle-reward-rail__label">{ru ? "Торговля" : "Trade"}</span>
              <AuctionUnreadBadge count={unreadCount} en={!ru} />

            </button>
          )}
          </div>
        </div>
      )}
      {/* Координаты в «Добыче» (отнятые шахты, поля) кликаются, как на карте:
          окно закрывается, игра выходит в мир и наводит камеру на клетку. */}
      {open === "harvest" && createPortal(<HarvestModal onClose={() => setOpen(null)} onShowCell={(q, r) => { setOpen(null); requestCenter({ q, r, ttlMs: 3000 }); }} />, document.body)}
      {open === "mines" && minesOffice && createPortal(<MineOfficeModal icon={MINE_OFFICE_LOOK} onClose={() => setOpen(null)} />, document.body)}
      {open === "weather" && weatherStation && createPortal(<WeatherStationModal icon={WEATHER_STATION_LOOK} onClose={() => setOpen(null)} />, document.body)}
      {open === "shaman" && shamanHut && createPortal(<ShamanHutModal icon={SHAMAN_ART} onClose={() => setOpen(null)} />, document.body)}
      {open === "gifts" && createPortal(
        <div className="castle-gifts-stage">
          {gifts.isPending || gifts.isError ? (
            <HudModal
              title={ru ? "Подарки" : "Gifts"}
              onClose={() => setOpen(null)}
              presentation="centered"
              modalKind="gifts"
            >
              {gifts.isPending ? (
                <p role="status">{ru ? "Загружаем подарки…" : "Loading gifts…"}</p>
              ) : (
                <div className="castle-gifts-stage__status">
                  <p role="alert">{ru ? "Не удалось загрузить подарки" : "Could not load gifts"}</p>
                  <button
                    data-game-button="secondary"
                    type="button"
                    onClick={() => void gifts.refetch()}
                  >
                    {ru ? "Повторить" : "Retry"}
                  </button>
                </div>
              )}
            </HudModal>
          ) : (
            <GiftsModal gifts={gifts.gifts} onClose={() => setOpen(null)} presentation="centered" onOpenPacks={onGiftAction ? (gift) => { setOpen(null); onGiftAction(gift); } : undefined} onViewGift={onGiftAction ? (gift) => { setOpen(null); onGiftAction(gift); } : undefined} />
          )}
        </div>, document.body
      )}
    </>
  );
}

