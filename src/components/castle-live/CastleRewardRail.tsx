import buildArt from "@/assets/harvest/castle-entry-build-png-optimized.webp";
import { useQuery } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { getSession } from "@/server/api/user-auth";
import { listAuctions } from "@/server/api/game-auction";
import { openAuction } from "@/lib/auctionBus";
import { AuctionCount } from "@/components/chips/auctions/AuctionCount";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import mineArt from "@/assets/harvest/castle-entry-pickaxe-png-optimized.webp";
import giftArt from "@/assets/harvest/castle-entry-gift-png-optimized.webp";
import { CastleHarvestModal } from "@/components/beta-raid/hud/CastleHarvestModal";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import { GiftsModal } from "@/components/beta-raid/hud/GiftsModal";
import { HudModal } from "@/components/beta-raid/hud/HudModal";
import { useHarvest, useGifts } from "@/components/beta-raid/hud/useHarvest";
import type { Lang } from "@/lib/store";
import type { MyGift } from "@/server/api/gifts";
import "./castle-reward-rail.css";

/** Castle entry for existing harvest and gift actions; the route controls real vs preview data. */
export function CastleRewardRail({ lang, onGiftAction, onBuild }: { lang: Lang; onBuild?: () => void; onGiftAction?: (gift: MyGift) => void }) {
  const [open, setOpen] = useState<"harvest" | "gifts" | null>(null);
  const giftButton = useRef<HTMLButtonElement>(null);
  const harvestButton = useRef<HTMLButtonElement>(null);
  const previousOpen = useRef<typeof open>(null);
  useEffect(() => {
    if (!open && previousOpen.current === "gifts") (giftButton.current ?? harvestButton.current)?.focus();
    if (!open && previousOpen.current === "harvest") harvestButton.current?.focus();
    previousOpen.current = open;
  }, [open]);
  const harvest = useHarvest();
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
          {onBuild && session.data?.isCastleEditor && <button type="button" aria-label={ru ? "Строительство" : "Construction"} title={ru ? "Строительство" : "Construction"} onClick={onBuild}><img src={buildArt} alt="" draggable={false} /><span className="castle-reward-rail__label">{ru ? "Строительство" : "Construction"}</span></button>}
          {showAuction && (
            <button type="button" aria-label={ru ? "Аукционы" : "Auctions"} title={ru ? "Аукционы" : "Auctions"} onClick={() => openAuction()}>
              <Gavel style={{ position: "relative", width: 28, height: 28 }} aria-hidden="true" />
              <span className="castle-reward-rail__label">{ru ? "Аукционы" : "Auctions"}</span>
              <AuctionCount n={auctionCount} />
            </button>
          )}
        </div>
      )}
      {/* Координаты в «Добыче» (отнятые шахты, поля) кликаются, как на карте:
          окно закрывается, игра выходит в мир и наводит камеру на клетку. */}
      {open === "harvest" && createPortal(<CastleHarvestModal onClose={() => setOpen(null)} onShowCell={(q, r) => { setOpen(null); requestCenter({ q, r, ttlMs: 3000 }); }} />, document.body)}
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
