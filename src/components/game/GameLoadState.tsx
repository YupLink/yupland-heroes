import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import yupikWalk from "../../assets/loading/yupik-walk.gif";
import yupikStill from "../../assets/loading/yupik-still.webp";
import { useSplashCovered } from "./splashPolicy";
import { reloadForStaleChunk, reloadQuietly } from "@/lib/staleReload";
import "./game-load-state.css";

/** Fresh HTML/chunks, preserving the route and Telegram launch fragment. */
export function reloadGameScreen() {
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

// Игрока не гоняем по кнопкам (владелец, 28.10.2026): сбой загрузки повторяем сами —
// через 3, 6, 12… до 30 с; серия забывается после двух минут без сбоев.
let failStreak = 0;
let failAt = 0;
function nextRetryDelay(): number {
  const now = Date.now();
  if (now - failAt > 120_000) failStreak = 0;
  failAt = now;
  return Math.min(3_000 * 2 ** failStreak++, 30_000);
}

export function GameLoadState({ ru, state, destination = "game", fullscreen = true, onRetry, onBack, backLabel, menu }: {
  ru: boolean;
  state: "loading" | "error" | "empty";
  destination?: "game" | "world" | "castle";
  fullscreen?: boolean;
  onRetry?: () => void;
  onBack?: () => void;
  backLabel?: string;
  /** Меню входа (GameStartMenu) вместо подписи и клеток: тот же Юпик идёт дальше, путь не начинается заново. */
  menu?: ReactNode;
}) {
  // Медленная сеть (17.10): с 15 с — подпись «Медленная сеть…», анимация идёт дальше;
  // «Обновить игру» — только с минуты: на медленном интернете перезагрузка начинает всё заново.
  const [slow, setSlow] = useState(false);
  const [delayed, setDelayed] = useState(false);
  const [walkReady, setWalkReady] = useState(false);
  const walkRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = walkRef.current;
    if (image?.complete) setWalkReady(image.naturalWidth > 0);
  }, []);
  useEffect(() => {
    setDelayed(false);
    setSlow(false);
    if (state !== "loading") return;
    const slowTimer = window.setTimeout(() => setSlow(true), 15_000);
    const timer = window.setTimeout(() => setDelayed(true), 60_000);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(timer);
    };
  }, [state, destination]);
  const covered = useSplashCovered();
  // Пока открыто меню входа, «загрузка задерживается» не показываем: игрок выбирает, а не ждёт.
  const stalled = !menu && state === "loading" && delayed;
  // Минута без ответа — обновляемся сами (не чаще раза в 10 мин: на медленной сети
  // перезагрузка начинает всё заново, поэтому дальше — кнопка).
  useEffect(() => {
    if (stalled) reloadQuietly("stall-reload-at", 10 * 60_000);
  }, [stalled]);
  const retryRef = useRef(onRetry);
  useEffect(() => {
    retryRef.current = onRetry;
  });
  useEffect(() => {
    // Полная перезагрузка страницы — только через сторож GameLoadBoundary, не по кругу.
    if (state !== "error" || !retryRef.current || retryRef.current === reloadGameScreen) return;
    const timer = window.setTimeout(() => retryRef.current?.(), nextRetryDelay());
    return () => window.clearTimeout(timer);
  }, [state]);
  const loading = state === "loading" && !stalled;
  const title = stalled ? ru ? "Загрузка задерживается" : "Loading is taking longer"
    : loading && slow
    ? ru ? "Медленная сеть…" : "Slow network…"
    : loading
    ? ru ? destination === "world" ? "Выходим в мир…" : destination === "castle" ? "Заходим в замок…" : "Открываем игру…" : destination === "world" ? "Heading into the world…" : destination === "castle" ? "Entering the castle…" : "Opening the game…"
    : state === "empty" ? ru ? "Карта пока недоступна" : "Map is unavailable"
    : ru ? "Не удалось загрузить экран" : "Unable to load this screen";
  const description = state === "error"
    ? ru ? "Проверь соединение и попробуй ещё раз." : "Check your connection and try again."
    : stalled ? ru ? "Грузится дольше минуты — обнови игру, приложение не закроется." : "Over a minute already — reload the game, the app stays open."
    : undefined;
  const actions = (
    <div className="game-load-state__actions">
      {stalled
        ? <button type="button" className="game-load-state__retry" onClick={reloadGameScreen}>{ru ? "Обновить игру" : "Reload game"}</button>
        : !loading && onRetry && <button type="button" className="game-load-state__retry" onClick={onRetry}>{ru ? "Повторить" : "Retry"}</button>}
      {onBack && <button type="button" onClick={onBack}>{backLabel ?? (ru ? "← Замок" : "← Castle")}</button>}
    </div>
  );
  // Под общей заставкой — пустой фон того же цвета: второй Юпик не нужен.
  if (covered && state === "loading") {
    return (
      <section
        className={`game-load-state${fullscreen ? " game-load-state--fullscreen" : ""}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <section className={`game-load-state${fullscreen ? " game-load-state--fullscreen" : ""}${loading ? " game-load-state--loading" : " game-load-state--inactive"}`} data-walk-ready={walkReady} aria-busy={loading && !menu}>
      {fullscreen ? <div className="game-load-state__scene">
        <img ref={walkRef} className="game-load-state__runner game-load-state__runner--walking" src={yupikWalk} alt="" aria-hidden="true" onLoad={() => setWalkReady(true)} onError={() => setWalkReady(false)} />
        <img className="game-load-state__runner game-load-state__runner--still" src={yupikStill} alt="" aria-hidden="true" />
        {loading && menu ? menu : loading ? <>
          <h1 className="game-load-state__caption" role="status">{title}</h1>
          <div className="game-load-state__cells" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => <span key={index} />)}
          </div>
        </> : <div className="game-load-state__message">
          <h1 role={state === "error" ? "alert" : "status"}>{title}</h1>
          {description && <p>{description}</p>}
          {actions}
        </div>}
      </div> : <div className="game-load-state__content">
        {loading && <span className="game-load-state__spinner" aria-hidden="true" />}
        <h1 role={state === "error" ? "alert" : "status"}>{title}</h1>
        {description && <p>{description}</p>}
        {actions}
      </div>}
    </section>
  );
}

/**
 * A failed lazy chunk needs a new page load; resetting React.lazy repeats the same rejected promise.
 * Перезагружаемся сами (раз в 30 с), игрок видит загрузку; кнопка — если перезагрузка не помогла.
 */
export class GameLoadBoundary extends Component<{ ru: boolean; children: ReactNode }, { failed: boolean; reloading: boolean }> {
  state = { failed: false, reloading: false };
  static getDerivedStateFromError() { return { failed: true, reloading: true }; }
  componentDidCatch() {
    if (!reloadForStaleChunk()) this.setState({ reloading: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.state.reloading
      ? <GameLoadState ru={this.props.ru} state="loading" />
      : <GameLoadState ru={this.props.ru} state="error" onRetry={reloadGameScreen} />;
  }
}
