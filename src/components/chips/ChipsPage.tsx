import { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { onChipsSub } from "@/lib/chipsNav";
import type { MyGift } from "@/server/api/gifts";
import { CastleProfileOverlay } from "@/components/castle-live/CastleProfileOverlay";
import { WalletModal } from "@/components/WalletModal";
import { getSession } from "@/server/api/user-auth";
import { MarketScreen } from "@/components/chips/MarketScreen";
import { HomeTab } from "@/components/chips/HomeTab";
import { ShopTab } from "@/components/chips/ShopTab";
import { PvpScreen } from "@/routes/chips.pvp";
import { PvpOff } from "./PvpOff";
import { usePvpEnabled } from "./usePvpEnabled";
import { BossScreen } from "@/components/BossScreen";
import { RaidWithBetaToggle } from "@/components/beta-raid/RaidWithBetaToggle";
import { BetaRaidScreen } from "@/components/beta-raid/BetaRaidScreen";
import { ChipsTab } from "@/components/chips/ChipsTab";
import { AuctionOverlay } from "@/components/chips/auctions/AuctionOverlay";
import { ChipsHeader } from "./ChipsHeader";
import { StatsBar } from "./StatsBar";
import { ChipsBottomNav } from "./ChipsBottomNav";
import { GuestEntry } from "@/components/auth/GuestEntry";
import { NftInputReceipt } from "./NftInputReceipt";
import { PlayerLetters } from "@/components/letters/PlayerLetters";

const TAB_VALUES = ["home", "chips", "shop", "market", "pvp", "boss", "raid", "beta-raid"] as const;
type Tab = (typeof TAB_VALUES)[number];
const TAB_LS_KEY = "chips-active-tab";
function readSavedTab(): Tab {
  if (typeof window === "undefined") return "home";
  try {
    const v = window.localStorage.getItem(TAB_LS_KEY);
    if (v && (TAB_VALUES as readonly string[]).includes(v)) return v as Tab;
  } catch {
    /* */
  }
  return "home";
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ChipsPage() {
  const ru = useAppStore((s) => s.lang) === "ru";
  const walletConnected = useAppStore((s) => s.walletConnected);
  const [walletOpen, setWalletOpen] = useState(false);
  const [tab, setTabState] = useState<Tab>("home");
  const [giftPack, setGiftPack] = useState<{ giftId: string; packId: string } | null>(null);
  // Полноэкранная карта. Состояние здесь, потому что прятать надо не только
  // карту, но и всё вокруг неё. Гасим при уходе с вкладки рейда — иначе игрок
  // вернулся бы в магазин без шапки и без меню.
  const [mapFullOn, setMapFullState] = useState(false);
  const mapFull = mapFullOn && tab === "beta-raid";
  // Полный экран убирает шапку и меню, страница схлопывается — и браузер
  // отматывает её в начало. Запоминаем, где стояли, и возвращаем на выходе:
  // иначе после сворачивания карту приходится искать прокруткой.
  const scrollBeforeFull = useRef(0);
  const setMapFull = useCallback((on: boolean) => {
    if (on) scrollBeforeFull.current = window.scrollY;
    setMapFullState(on);
    if (!on) {
      const y = scrollBeforeFull.current;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    }
  }, []);
  useIsoLayoutEffect(() => {
    const saved = readSavedTab();
    if (saved !== "home") setTabState(saved);
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      window.localStorage.setItem(TAB_LS_KEY, t);
    } catch {
      /* */
    }
  }, []);
  // «Покажи, где выданное» из модалки ввода NFT: сначала сама вкладка «Фишки»,
  // подвкладку внутри выберет ChipsTab.
  useEffect(() => onChipsSub(() => setTab("chips")), [setTab]);
  useEffect(() => {
    if (tab !== "raid" && tab !== "beta-raid") setGiftPack(null);
  }, [tab]);
  const onOpenGiftPack = (gift: MyGift) => {
    if (gift.kind !== "pack" || !gift.refId?.startsWith("cp_")) return;
    setGiftPack({ giftId: gift.id, packId: gift.refId });
  };

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const sessionLoading = session.isLoading;
  const isAdmin = !!session.data?.isAdmin;
  const pvpOn = usePvpEnabled();
  // Бета-рейд открыт админам и тестерам, которым его включили.
  const canBetaRaid = !!session.data?.features?.beta_raid;
  // Старые рейды закрыты — гекс-карта заняла их место и зовётся просто «Рейд».
  const hexRaid = session.data?.raidMode === "hex";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_25%_15%,rgba(255,184,0,0.18),transparent_70%),radial-gradient(50%_50%_at_85%_70%,rgba(56,189,248,0.10),transparent_70%),radial-gradient(40%_40%_at_60%_90%,rgba(255,107,107,0.08),transparent_70%)]"
      />

      {/* Шапка с логотипом и кошельком — тоже «шторка сверху»: в полноэкранном
          её быть не должно, карта занимает экран целиком. */}
      {!mapFull && <ChipsHeader />}

      {sessionLoading ? (
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !walletConnected ? (
        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-6">
          <GuestEntry />
        </div>
      ) : (
        <>
          {/* Полный экран = карта и ничего кроме карты: шапку балансов и нижнее
              меню НЕ рендерим вовсе, а не прячем стилями — скрытая панель всё
              равно ловила бы тапы у края экрана. */}
          {!mapFull && <StatsBar showNftInput={tab !== "beta-raid" && tab !== "raid"} />}

          <main
            className={
              mapFull
                ? "relative z-10 w-full"
                : "relative z-10 mx-auto w-full max-w-3xl px-4 pb-28 pt-3"
            }
          >
            {tab === "home" && (
              <HomeTab
                onPlay={() => setTab("shop")}
                onPvp={() => setTab("pvp")}
                onShop={() => setTab("shop")}
                onChips={() => setTab("chips")}
                onBoss={() => setTab("boss")}
                onRaid={() => setTab(hexRaid ? "beta-raid" : "raid")}
                showRaid={true}
                hexRaid={hexRaid}
                onBetaRaid={() => setTab("beta-raid")}
                showBetaRaid={!hexRaid && canBetaRaid}
              />
            )}
            {tab === "chips" && <ChipsTab isAdmin={isAdmin} />}
            {tab === "shop" && <ShopTab />}
            {tab === "market" && <MarketScreen />}
            {tab === "pvp" &&
              (pvpOn ? (
                <PvpScreen onBack={() => setTab("home")} />
              ) : (
                <PvpOff onBack={() => setTab("home")} />
              ))}
            {tab === "boss" && <BossScreen onBack={() => setTab("home")} />}
            {tab === "raid" && (
              <RaidWithBetaToggle
                onClose={() => setTab("home")}
                canBetaRaid={canBetaRaid}
                onOpenGiftPack={onOpenGiftPack}
              />
            )}
            {tab === "beta-raid" && (
              <BetaRaidScreen
                onClose={() => setTab("home")}
                onOpenGiftPack={onOpenGiftPack}
                fullscreen={mapFull}
                onToggleFullscreen={() => setMapFull(!mapFull)}
              />
            )}
          </main>

          {!mapFull && <ChipsBottomNav tab={tab} setTab={setTab} />}
        </>
      )}

      {/* Окно аукциона поверх всего: открывается из HUD замка и плашки на карте. */}
      <AuctionOverlay />

      {giftPack && (tab === "raid" || tab === "beta-raid") && (
        <CastleProfileOverlay
          ru={ru}
          onClose={() => setGiftPack(null)}
          initialGiftPack={giftPack}
        />
      )}
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      {/* Квитанция прошлого ввода NFT: игрок мог закрыть окно, не прочитав итог. */}
      <NftInputReceipt />
      {/* Письма на весь экран при входе в игру: по одному, до «Понятно». */}
      <PlayerLetters />
    </div>
  );
}
