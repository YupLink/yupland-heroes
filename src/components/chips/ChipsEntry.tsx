// Общий вход: единый замок и мир для вошедших игроков.
// До получения сессии не показываем прежний интерфейс, чтобы избежать смешения.
//
// Заставка с Юпиком — одна на весь вход и лежит ПОВЕРХ игры: игра грузится под
// ней сразу (код, «где герой», карта, картинки), а заставка уходит, когда
// стартовый экран дорисован (CastleGame.onReady). Раньше она отсиживала свои
// 3,5 с впустую, потом начиналась загрузка карты со своей заставкой, и Юпик
// трижды начинал путь заново, а карта открывалась в квадратиках (12.10.2026).
// Минимума нет: это окно загрузки, оно есть, пока грузится игра (владелец).
//
// На той же заставке — меню входа новичка (22.10.2026, #497194): «Начать игру»
// и выбор расы. Вернувшийся игрок входит как раньше, без меню. Игра грузится под
// меню, а окна игры (письма, квитанция NFT) ждут, пока меню закроют: модальное
// окно под меню перехватило бы нажатия.
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { GameLoadBoundary, GameLoadState } from "@/components/game/GameLoadState";
import { entryScreen } from "@/components/game/screenReadiness";
import { SplashCover } from "@/components/game/splashPolicy";
import { NftInputReceipt } from "./NftInputReceipt";
import { PlayerLetters } from "@/components/letters/PlayerLetters";
import { useLang } from "@/lib/i18n";
import { tgLoginPending, useTgLogin } from "@/lib/auth/telegramLogin";
import { GuestEntry } from "@/components/auth/GuestEntry";
import { GameStartMenu } from "@/components/game-start/GameStartMenu";
import { useStartMenu } from "@/components/game-start/useStartMenu";

// Module state resets on a full page load; in-app navigation does not replay the intro.
let startupSplashCompleted = false;

const loadCastleGame = () =>
  import("@/components/castle-live/CastleGame").then((m) => ({ default: m.CastleGame }));
const CastleGame = lazy(loadCastleGame);
// Старый интерфейс (без кошелька) — отдельным куском: вошедшим он не нужен.
const ChipsPage = lazy(() => import("./ChipsPage").then((m) => ({ default: m.ChipsPage })));

export function ChipsEntry() {
  const ru = useLang() === "ru";
  const [mounted, setMounted] = useState(false);
  const [classic, setClassic] = useState(false);
  const [intro] = useState(() => !startupSplashCompleted);
  const [gameReady, setGameReady] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Код игры — сразу, вместе с сессией: вошедший игрок почти всегда идёт в игру.
    void loadCastleGame().catch(() => {});
  }, []);
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const tgPending = tgLoginPending(useTgLogin((s) => s.state));
  const screen = entryScreen(mounted, classic, session, tgPending);
  const onReady = useCallback(() => setGameReady(true), []);
  const covered = intro && screen === "castle" && !gameReady;
  useEffect(() => {
    if (intro && screen === "castle" && !covered) startupSplashCompleted = true;
  }, [intro, screen, covered]);
  // Меню входа — раз на загрузку страницы; решение «показать/пропустить» одно.
  const startMenu = useStartMenu(screen === "castle", session.data?.wallet ?? null, gameReady);
  const menu = startMenu.mode;
  const menuUp = menu === "new";
  // Пока решается, новичок ли это, заставка держится: игра не мелькает до меню.
  const holdPopups = menuUp || menu === "pending";
  const splash = screen === "loading" || screen === "error" || covered || holdPopups;
  return (
    <>
      {screen === "guest" && <GuestEntry />}
      {screen === "classic" && (
        <Suspense fallback={<GameLoadState ru={ru} state="loading" />}>
          <ChipsPage />
        </Suspense>
      )}
      {screen === "castle" && (
        <SplashCover.Provider value={covered}>
          <GameLoadBoundary ru={ru}>
            <Suspense fallback={covered ? null : <GameLoadState ru={ru} state="loading" />}>
              <CastleGame onClassic={() => setClassic(true)} onReady={onReady} />
              {!holdPopups && <NftInputReceipt />}
              {!holdPopups && <PlayerLetters />}
            </Suspense>
          </GameLoadBoundary>
        </SplashCover.Provider>
      )}
      {/* Одно место в дереве на весь вход: Юпик не начинает путь заново. */}
      {splash && (
        <div className="fixed inset-0 z-[100]">
          <GameLoadState
            ru={ru}
            state={screen === "error" ? "error" : "loading"}
            onRetry={() => void session.refetch()}
            menu={
              menuUp ? (
                <GameStartMenu
                  options={startMenu.options}
                  invite={startMenu.invite}
                  onDone={startMenu.close}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </>
  );
}
