// Общий игровой вход: замок и мир для вошедших игроков.
// Редактор и административные действия сохраняют отдельные права.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { castleGameLoad } from "@/server/api/castle-editor";
import { useLang } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import {
  LazyBetaRaidScreen,
  LazyCastleLiveView,
  LazyIslandCastleGuide,
  LazyProfileOverlay,
  LazyTavernOverlay,
  preloadScreen,
} from "./castleGameLazy";
import { readLastScreen, startScreen, writeLastScreen } from "./lastScreen";
import { setFocalPinch } from "@/components/beta-raid/pinchMode";
import { useHomeCastle } from "./useHomeCastle";
import { CastleHomeDialog } from "./CastleHomeDialog";
import { CastleProfileButton } from "./CastleProfileButton";
import { AuctionOverlay } from "@/components/chips/auctions/AuctionOverlay";
import { BankOverlay } from "./bank/BankOverlay";
import { CastleLoadState } from "./CastleLoadState";
import { GameLoadState } from "@/components/game/GameLoadState";
import { useScreenSettled } from "@/components/game/useScreenSettled";
import { subscribeCenterNavigation } from "@/components/beta-raid/centerMapBus";
import { CastleModeContext } from "@/components/beta-raid/castleMode";
import type { MyGift } from "@/server/api/gifts";

export function CastleGame({ onClassic, onReady }: {
  onClassic: () => void;
  /** Стартовый экран дорисован (или показал ошибку) — общая заставка может уходить. */
  onReady?: () => void;
}) {
  const ru = useLang() === "ru";
  const navigate = useNavigate();
  // Где начать — решается один раз по первому ответу «где герой»: у замка или
  // ратуши — замок, иначе сразу мир. Дальше экран меняют только ворота и вход.
  const [chosen, setChosen] = useState<"castle" | "raid" | null>(null);
  const [transition, setTransition] = useState<{ to: "castle" | "raid"; id: number } | null>(null);
  const transitionId = useRef(0);
  const raidReadinessRef = useRef<"loading" | "ready" | "error" | "empty">("loading");
  const castleReadinessRef = useRef<"loading" | "ready" | "error" | "empty">("loading");
  const beginTransition = useCallback((to: "castle" | "raid") => {
    const readiness = to === "raid" ? raidReadinessRef.current : castleReadinessRef.current;
    setChosen(to); // Mount a cold destination immediately so its queries run behind the splash.
    if (readiness !== "loading") {
      setTransition(null); // A warm screen or its error state needs no artificial loading.
      return;
    }
    setTransition({ to, id: ++transitionId.current });
  }, []);
  const home = useHomeCastle(ru, () => beginTransition("castle"));
  const wallet = useQuery({ queryKey: ["session"], queryFn: () => getSession() }).data?.wallet;
  // Код запомненного экрана — сразу, не дожидаясь ответа «где герой».
  // Памяти нет (первый вход) — карту, как и раньше: она нужна чаще замка.
  const [saved] = useState(() => readLastScreen(wallet));
  useEffect(() => preloadScreen(saved ?? "raid"), [saved]);
  const placed = useRef<"castle" | "raid" | null>(null);
  if (placed.current === null && home.status.data) {
    placed.current = startScreen(saved, !!home.status.data?.here);
  }
  const screen = chosen ?? placed.current;
  useEffect(() => {
    if (screen) writeLastScreen(wallet, screen);
  }, [screen, wallet]);
  // Карта мира и замок монтируются, когда их впервые показали, и дальше живут
  // скрытыми: прежде каждый «Замок → мир» строил карту заново, а замок качал
  // свои картинки (~0,5 МБ) и данные, даже когда герой в мире, — и карта мира
  // ждала его загрузки (07.10.2026: «карта очень долго грузится»).
  const [seen, setSeen] = useState({ castle: false, raid: false });
  useEffect(() => {
    if (screen && !seen[screen]) setSeen((v) => ({ ...v, [screen]: true }));
  }, [screen, seen]);
  const raidMounted = seen.raid || screen === "raid";
  const castleMounted = seen.castle || screen === "castle";
  // Карта мира из замка — щипок «под пальцами» (pinchMode.ts).
  useEffect(() => {
    setFocalPinch(true);
    return () => setFocalPinch(false);
  }, []);
  const toWorld = () => beginTransition("raid");
  // Стабильная ссылка: HUD карты под memo и не должен перерисовываться зря.
  const tryRef = useRef(home.tryEnter);
  tryRef.current = home.tryEnter;
  const enter = useCallback(() => void tryRef.current(), []);
  const homeCell = home.status.data?.home;
  // Профиль — поверх карты мира, таверна замка — у любой таверны мира.
  const [overlay, setOverlay] = useState<"profile" | "tavern" | null>(null);
  const [giftPack, setGiftPack] = useState<{ giftId: string; packId: string } | null>(null);
  const onOpenGiftPack = (gift: MyGift) => {
    if (gift.kind !== "pack" || !gift.refId?.startsWith("cp_")) return;
    setGiftPack({ giftId: gift.id, packId: gift.refId });
    setOverlay("profile");
  };
  const [tavernSection, setTavernSection] = useState<"heroes" | "artifacts">("heroes");
  const openTavern = useCallback((kind?: "hero" | "artifact") => {
    setTavernSection(kind === "artifact" ? "artifacts" : "heroes");
    setOverlay("tavern");
  }, []);
  // Coordinate links are camera navigation, never a hero move or building entry.
  useEffect(() => subscribeCenterNavigation(() => {
    setOverlay(null);
    beginTransition("raid");
  }), [beginTransition]);
  const castleMode = useMemo(
    () => ({
      home: homeCell ? { q: homeCell.q, r: homeCell.r } : null,
      enter,
      enterAt: (q: number, r: number) => tryRef.current({ q, r }),
      openProfile: () => setOverlay("profile"),
      profileButton: <CastleProfileButton onClick={() => setOverlay("profile")} />,
      openTavern: () => openTavern(),
    }),
    [homeCell?.q, homeCell?.r, enter, openTavern],
  );
  const castle = useQuery({
    queryKey: ["castle-game"],
    queryFn: () => castleGameLoad(),
    staleTime: 5 * 60_000,
    gcTime: 0,
    refetchOnReconnect: false,
    enabled: castleMounted,
  });

  const empty = !!castle.data && Object.keys(castle.data.cells).length === 0;
  const castleState = castle.isError ? "error" : empty ? "empty" : !castle.data ? "loading" : null;
  // «Готов» — дорисован: данные пришли, картинки догружены (useScreenSettled).
  const castleSettled = useScreenSettled("castle", castleMounted && !castleState);
  const castleReady = castleState ?? (castleSettled ? "ready" : "loading");
  castleReadinessRef.current = castleReady;
  const [raidReadiness, setRaidReadiness] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const raidSettled = useScreenSettled("raid", raidMounted && raidReadiness === "ready");
  const raidReady = raidReadiness === "ready" && !raidSettled ? "loading" : raidReadiness;
  raidReadinessRef.current = raidReady;
  const targetReadiness = transition?.to === "raid" ? raidReady : castleReady;
  const startReady = !screen ? (home.status.isError ? "error" : "loading") : screen === "raid" ? raidReady : castleReady;
  useEffect(() => {
    if (startReady !== "loading") onReady?.();
  }, [startReady, onReady]);
  // Окно загрузки — ровно пока грузится экран: дорисовался — сразу внутрь
  // (владелец, 12.10.2026: «ждать минимум не нужно»).
  useEffect(() => {
    if (transition && targetReadiness !== "loading") setTransition(null);
  }, [transition, targetReadiness]);
  if (!screen) return <GameLoadState ru={ru} state={home.status.isError ? "error" : "loading"} onRetry={() => void home.status.refetch()} />;

  const inRaid = screen === "raid";
  return (
    <>
      {raidMounted && (
        // Скрыта — не видна, не ловит нажатий и фокус (inert), размер холста
        // сохраняется: вернувшись, игрок видит карту сразу.
        <div className={inRaid ? undefined : "invisible pointer-events-none"} inert={!inRaid || undefined}>
          <CastleModeContext.Provider value={castleMode}>
            <Suspense fallback={null}>
              <LazyBetaRaidScreen fullscreen onOpenGiftPack={onOpenGiftPack} onClose={enter} onCastle={enter} onLoadingBack={seen.castle ? () => beginTransition("castle") : undefined} onReadiness={setRaidReadiness} />
            </Suspense>
          </CastleModeContext.Provider>
        </div>
      )}
      {castleMounted && (
        <div className={inRaid ? "invisible pointer-events-none" : undefined} inert={inRaid || undefined}>
          {castleState || !castle.data ? (
            <CastleLoadState
              ru={ru}
              state={castleState ?? "loading"}
              onRetry={() => void castle.refetch()}
              onClassic={onClassic}
              onWorld={toWorld}
            />
          ) : (
            <Suspense fallback={null}>
            <LazyCastleLiveView
              entry="game"
              cells={castle.data.cells}
              assets={castle.data.assets}
              onEdit={() => void navigate({ to: "/castle-editor", search: {} })}
              onCity={toWorld}
              onSignedOut={() => void navigate({ to: "/" })}
              onMakeMainCastle={home.status.data?.here && !home.status.data.atHome && !home.status.data.island ? home.offerMain : undefined}
              isMainCastle={Boolean(home.status.data?.here && home.status.data.atHome)}
            />
            </Suspense>
          )}
        </div>
      )}
      {transition && (
        <div className="fixed inset-0 z-[90]">
          <GameLoadState ru={ru} state="loading" destination={transition.to === "raid" ? "world" : "castle"} />
        </div>
      )}
      {overlay === "profile" && <Suspense fallback={null}><LazyProfileOverlay ru={ru} onClose={() => { setGiftPack(null); setOverlay(null); }} onOpenTavern={openTavern} initialGiftPack={giftPack} /></Suspense>}
      {overlay === "tavern" && <Suspense fallback={null}><LazyTavernOverlay ru={ru} onClose={() => setOverlay(null)} initialSection={tavernSection} /></Suspense>}
      {home.offer && (
        <CastleHomeDialog
          offer={home.offer}
          ru={ru}
          pending={home.relocate.isPending}
          onConfirm={() => home.relocate.mutate()}
          onClose={home.closeOffer}
        />
      )}
      {/* Подсказки острова, пока карты нет: с ней их ведёт слой острова на карте. */}
      {!raidMounted && home.status.data?.island && <Suspense fallback={null}><LazyIslandCastleGuide /></Suspense>}
      {/* Окно аукциона — поверх замка и мира, открывается из HUD/плашки на карте. */}
      <AuctionOverlay />
      <BankOverlay />
    </>
  );
}
