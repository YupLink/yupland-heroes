import {modularBuildingDestination, modularBuildingId} from "./modularCastleActions";import {AUCTION_BUILDING_ID} from "./modularAuctionHouse";import {CASINO_BUILDING_ID} from "./modularCasino";import {BANK_BUILDING_ID} from "./modularBank";import {openBank} from "@/lib/bankBus";import {CasinoOverlay} from "@/components/beta-raid/CasinoOverlay";import {openAuction} from "@/lib/auctionBus";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import "./tavern-hero-cards.css";
import { CastleProfileButton } from "./CastleProfileButton";
import { CastleGateDialog } from "./CastleGateDialog";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { WindowError } from "./WindowError";
import { useAppStore } from "@/lib/store";
import { label, type Bindings, type Destination } from "@/lib/castleMenus";
import { CastleViewport } from "./CastleViewport";
import { CastleResourceDock } from "./CastleResourceDock";
import { CastleMainHud } from "./CastleMainHud";
import { CastleRewardRail } from "./CastleRewardRail";
import { TownHallScreen } from "./TownHallScreen";
import { CastleQuestBoard } from "./CastleQuestBoard";
import { CastleIntro, CastleUnassigned, CastleWarehouseWindow } from "./CastleSimpleWindows";
import { TempleLiveWindow } from "./temple/TempleLiveWindow";
import type { CastleLiveViewProps } from "./castleLiveViewProps";
import type { MyGift } from "@/server/api/gifts";
import { Barracks, Glory, Market, Profile, Shop, Tavern, Treasury } from "./castleLazyWindows";
type WindowId = Exclude<Destination, "gates"> | "profile" | "profile-packs" | "unassigned";
export function CastleLiveView({
  cells,
  assets,
  onEdit,
  onCity,
  onSignedOut,
  entry = "editor",
  profileWalletStatus,
  profileWalletName,
  onPreviewWalletChange,
  treasuryWalletRequest,
  questProgress,
  onClaimQuestReward,
  playerLevel,
  onMakeMainCastle,
  isMainCastle,
}: CastleLiveViewProps) {
  const [sceneEditing,setSceneEditing]=useState(false);
  const lang = useAppStore((s) => s.lang);
  const ru = lang === "ru";
  const [tavernSection, setTavernSection] = useState<"heroes" | "artifacts">("heroes");
  const [windowId, setWindowId] = useState<WindowId | null>(null);
  const [casinoOpen, setCasinoOpen] = useState(false); // казино на площади (useWithCasino) → автомат
  const [openWalletOnTreasuryEntry, setOpenWalletOnTreasuryEntry] = useState(false);
  const [barracksInitialPage, setBarracksInitialPage] = useState<"chips" | "packs">("chips");
  const [giftPack, setGiftPack] = useState<{ giftId: string; packId: string } | null>(null);
  const [focusPacksOnMount, setFocusPacksOnMount] = useState(false);
  const [accepted, setAccepted] = useState(entry === "game");
  const [gatesOpen, setGatesOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const treasuryFromProfile = useRef(false); // Казна открыта из профиля — «назад» туда
  const lastFocus = useRef<HTMLElement | SVGElement | null>(null);
  const bindings = useMemo(
    () =>
      Object.fromEntries(
        assets.filter((a) => a.kind === "building").map((a) => [a.id, a.menu_action ?? ""]),
      ) as Bindings,
    [assets],
  );
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  useEffect(() => {
    if (windowId && windowId !== "notice") closeButton.current?.focus();
  }, [windowId]);
  const open = (id: WindowId | "gates", barracksPage: "chips" | "packs" = "chips", fromProfile = false) => {
    if (!windowId) lastFocus.current = document.activeElement as HTMLElement | SVGElement | null;
    if (id === "gates") {
      setGatesOpen(true);
      return;
    }
    if (id === "shop") { open("barracks", "packs"); return; }
    if (id === "tavern") setTavernSection("heroes");
    if (id === "barracks") setBarracksInitialPage(barracksPage);
    if (id === "profile") setFocusPacksOnMount(fromProfile);
    if (!windowId) lastFocus.current = document.activeElement as HTMLElement | SVGElement | null;
    setWindowId(id);
  };
  const close = () => {
    setWindowId(null);
    setGiftPack(null);
    setOpenWalletOnTreasuryEntry(false);
    requestAnimationFrame(() => lastFocus.current?.focus());
  };
  useEffect(() => {
    if (!treasuryWalletRequest) return;
    lastFocus.current = document.activeElement as HTMLElement | SVGElement | null;
    setOpenWalletOnTreasuryEntry(true);
    setWindowId("treasury");
  }, [treasuryWalletRequest]);
  useEffect(() => {
    if (windowId !== "glory") return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [windowId]);
  const onViewMysticReward = (kind: "hero" | "artifact") => {
    open("tavern");
    setTavernSection(kind === "hero" ? "heroes" : "artifacts");
  };
  const onGiftAction = (gift: MyGift) => {
    if (gift.kind === "hero" || gift.kind === "art") {
      open("tavern");
      setTavernSection(gift.kind === "hero" ? "heroes" : "artifacts");
      return;
    }
    if (gift.kind === "pack" && gift.refId?.startsWith("cp_")) {
      setGiftPack({ giftId: gift.id, packId: gift.refId });
      open("barracks", "packs");
    }
  };
  const backFromPacks = () => {
    setGiftPack(null);
    open("profile", "chips", true);
  };
  const tavernOnMap = Object.values(cells).some(cell => cell.buildingId && bindings[cell.buildingId] === "tavern");
  const body = () => {
    switch (windowId) {
      case "tavern":
        return <Tavern key={tavernSection} onClose={close} initialSection={tavernSection} allowHeroSelection />;
      case "barracks":
        return <Barracks onClose={close} onTavern={() => open("tavern")} initialPage={barracksInitialPage} giftPack={giftPack} onPacksBackToCamp={() => setGiftPack(null)} onViewMysticReward={onViewMysticReward} />;
      case "profile-packs":
        return <Barracks onClose={backFromPacks} onInitialPacksBack={backFromPacks} onTavern={() => open("tavern")} initialPage="packs" giftPack={giftPack} onViewMysticReward={onViewMysticReward} />;
      case "market":
        return <Market />;
      case "glory":
        return <Glory defaultOpen />;
      case "profile":
        return <Profile onTreasury={() => { treasuryFromProfile.current = true; open("treasury"); }} walletStatus={profileWalletStatus} onPreviewWalletChange={onPreviewWalletChange} onSignedOut={onSignedOut ?? onEdit} onEdit={undefined} playerLevel={playerLevel} onOpenPacks={() => open("profile-packs")} focusPacksOnMount={focusPacksOnMount} />;
      case "notice":
        return <CastleQuestBoard ru={ru} onClose={close} onBarracks={() => open("barracks")} onWorld={() => open("gates")} progressByQuest={questProgress} onClaimReward={onClaimQuestReward} />;
      case "warehouse":
        return <CastleWarehouseWindow onBack={close} onShowCell={(q, r) => {
          setWindowId(null);
          requestCenter({ q, r, ttlMs: 3000 });
        }} />;
      case "temple":
        return <TempleLiveWindow ru={ru} onBack={close} />;
      case "unassigned":
        return <CastleUnassigned ru={ru} />;
      default:
        return null;
    }
  };
  return (
    <main data-game-buttons-scope={windowId === null || windowId === "tavern" || windowId === "profile" ? "" : undefined} className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header
        inert={windowId ? true : undefined}
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 p-2 pt-[max(8px,env(safe-area-inset-top))] ${accepted && entry === "game" ? "castle-desktop-toolbar" : ""} ${windowId || sceneEditing ? "invisible" : ""}`}
      >
        {entry === "editor" && <button data-game-button="secondary"
          className="pointer-events-auto min-h-11 rounded-lg border bg-background/90 px-3 shadow-sm"
          onClick={onEdit}
        >
          {ru ? "← Редактирование" : "← Edit"}
        </button>}
        {accepted && entry === "game" && <CastleMainHud ru={ru} />}
        {accepted && entry === "game" && <CastleRewardRail lang={lang} onGiftAction={onGiftAction} onBuild={()=>setSceneEditing(true)} />}
        <div className="castle-toolbar-profile pointer-events-auto ml-auto">
          {accepted && <CastleProfileButton onClick={() => open("profile")} showSatiety={entry === "game"} />}
        </div>
      </header>
      {!accepted ? (
        <CastleIntro ru={ru} onAccept={() => setAccepted(true)} />
      ) : (
        <>
          <div
            className={`relative flex min-h-0 flex-1 flex-col ${windowId && windowId !== "notice" ? "invisible" : ""}`}
            inert={windowId ? true : undefined}
          >
            <CastleViewport
              modular={entry === "game"} editing={sceneEditing} onDone={()=>setSceneEditing(false)}
              cells={cells}
              assets={assets}
              bindings={bindings}
              lang={lang}
              onBuilding={(id) => id === modularBuildingId(BANK_BUILDING_ID) ? openBank() : id === modularBuildingId(CASINO_BUILDING_ID) ? setCasinoOpen(true) : id === modularBuildingId(AUCTION_BUILDING_ID) ? openAuction("player") : open(bindings[id] || modularBuildingDestination(id) as Destination || "unassigned")}
            />
            {!windowId && !sceneEditing && <CastleResourceDock ru={ru} />}
          </div>
          {entry !== "game" && <CastleRewardRail lang={lang} onGiftAction={onGiftAction} />}
          {!windowId && entry !== "game" && !tavernOnMap && <button type="button" data-game-button="secondary" className="absolute left-3 top-[112px] z-30 min-h-11 rounded-xl border border-gold/40 bg-background/85 px-3 text-sm text-gold backdrop-blur" onClick={() => { setTavernSection("heroes"); open("tavern"); }}>{ru ? "Таверна" : "Tavern"}</button>}
          {windowId && (
            <section
              data-trading-house-window={windowId === "shop" ? "" : undefined}
              data-tavern-style={windowId === "tavern" ? "" : undefined}
              className={`absolute inset-0 z-40 flex flex-col bg-background ${windowId === "profile" ? "castle-profile-window" : windowId === "notice" ? "quest-window-shell" : ""}`}
              aria-labelledby={windowId === "notice" ? "quest-preview-title" : "castle-window-title"}
              role={windowId === "notice" ? "dialog" : undefined}
              aria-modal={windowId === "notice" ? true : undefined}
            >
              {windowId === "hall" ? (
                <TownHallScreen ru={ru} onBack={close} backRef={closeButton} onMakeMainCastle={onMakeMainCastle} isMainCastle={isMainCastle} />
              ) : windowId === "treasury" ? (
                <Suspense fallback={<p role="status">{ru ? "Загрузка…" : "Loading…"}</p>}>
                  <Treasury onBack={() => { if (treasuryFromProfile.current) { treasuryFromProfile.current = false; setWindowId("profile"); } else close(); }} backRef={closeButton} walletStatus={profileWalletStatus} walletName={profileWalletName} onPreviewWalletChange={onPreviewWalletChange} openWalletConnection={openWalletOnTreasuryEntry} />
                </Suspense>
              ) : (<>
              <header className={`flex shrink-0 items-center gap-3 border-b p-3 pt-[max(12px,env(safe-area-inset-top))] ${windowId === "barracks" || windowId === "profile-packs" || windowId === "shop" || windowId === "notice" || windowId === "warehouse" || windowId === "temple" ? "hidden" : ""}`}>
                <button data-game-button="secondary"
                  ref={closeButton}
                  className="min-h-11 rounded-lg border px-3"
                  onClick={close}
                >
                  {ru ? "← Замок" : "← Castle"}
                </button>
                <h1 id={windowId === "warehouse" ? undefined : "castle-window-title"} className="font-bold">
                  {windowId === "unassigned"
                    ? ru
                      ? "Постройка"
                      : "Building"
                    : windowId === "profile-packs"
                      ? ru ? "Паки" : "Packs"
                    : windowId === "profile"
                      ? ru
                        ? "Профиль"
                        : "Profile"
                      : label(windowId, lang)}
                </h1>
              </header>
              <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))] ${windowId === "barracks" || windowId === "profile-packs" ? "barracks-window-scroll" : windowId === "shop" ? "trading-house-window-scroll" : windowId === "notice" ? "quest-window-scroll" : windowId === "temple" ? "temple-window-scroll" : ""}`}>
                <div className={`mx-auto ${windowId === "temple" ? "max-w-none" : "max-w-3xl"}`} onClick={event => { if (windowId === "notice" && event.target === event.currentTarget) close(); }}>
                  <WindowError
                    key={windowId}
                    retry={
                      ru ? "Не удалось открыть окно. Повторить" : "Unable to open screen. Retry"
                    }
                  >
                    <Suspense fallback={<p role="status">{ru ? "Загрузка…" : "Loading…"}</p>}>
                      {body()}
                    </Suspense>
                  </WindowError>
                </div>
              </div>
              </>)}
            </section>
          )}
        </>
      )}
      <CastleGateDialog
        onReturnFocus={() => lastFocus.current?.focus()}
        open={gatesOpen}
        onClose={() => setGatesOpen(false)}
        onCity={onCity}
        ru={ru}
      />
      <CasinoOverlay open={casinoOpen} onClose={() => setCasinoOpen(false)} />
    </main>
  );
}




