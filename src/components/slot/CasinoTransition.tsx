import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { casinoMusicFocus } from "@/lib/audio/castleMusicController";
import { fadeExplorationForCasino } from "@/lib/audio/castleMusicChannel";
import "./casino-transition.css";

export const CASINO_FADE_MS = 700;
export const CASINO_PAUSE_MS = 400;
export const CASINO_REVEAL_MS = 550;
export const CASINO_TRANSITION_MS = CASINO_FADE_MS + CASINO_PAUSE_MS + CASINO_REVEAL_MS;

/** The image is decorative: failed downloads never hold a player in a loading screen. */
export function CasinoTransition({ leaving = false, reveal = false, ru = true }: { leaving?: boolean; reveal?: boolean; ru?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Портал — только после монтирования: при гидрации /slot сервер отдал null, и портал
  // в первом рендере клиента давал React #418 (разметка не совпала).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, [mounted]);
  return !mounted ? null : createPortal(
    <dialog ref={dialog} onCancel={event => event.preventDefault()} className={`casino-transition${reveal ? " casino-transition--reveal" : ""}`} role="status" aria-live="polite">
      <img src="/slot/transition/casino-entrance.webp" srcSet="/slot/transition/casino-entrance-small.webp 480w, /slot/transition/casino-entrance.webp 768w" sizes="(max-width:480px) 100vw, 768px" width="768" height="1152" alt="" />
      <div className="casino-transition__shade" />
      <span>{leaving ? (ru ? "Возвращаемся…" : "Returning…") : (ru ? "Включаем «Раскопки»…" : "Opening Excavation…")}</span>
    </dialog>, document.body,
  );
}

/** Retain the original route underneath, so closing returns to its own music. */
export function useCasinoTransition() {
  const [stage, setStage] = useState<"entering" | "playing" | "leaving">("entering");
  const [elapsed, setElapsed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closing = useRef(false);
  useEffect(() => {
    let release: (() => void) | undefined;
    fadeExplorationForCasino(0, CASINO_FADE_MS / 1000);
    const focusTimer = setTimeout(() => { release = casinoMusicFocus.acquire(); }, CASINO_FADE_MS);
    const entryTimer = setTimeout(() => setElapsed(true), CASINO_FADE_MS + CASINO_PAUSE_MS);
    // Slow or blocked audio must not prevent access to the game or its retry controls.
    const fallback = setTimeout(() => setAudioReady(true), 8000);
    return () => {
      clearTimeout(focusTimer); clearTimeout(entryTimer); clearTimeout(fallback); clearTimeout(closeTimer.current);
      release?.();
      fadeExplorationForCasino(1, .75);
    };
  }, []);
  useEffect(() => {
    if (!elapsed || !audioReady || stage !== "entering") return;
    setReveal(true);
    const timer = setTimeout(() => setStage("playing"), CASINO_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [elapsed, audioReady, stage]);
  useEffect(() => {
    if (stage !== "leaving") return;
    const timer = setTimeout(() => setReveal(true), CASINO_FADE_MS + CASINO_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [stage]);
  const exit = (done: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setReveal(false);
    setStage("leaving");
    closeTimer.current = setTimeout(done, CASINO_TRANSITION_MS);
  };
  return { stage, reveal, exit, setAudioReady };
}
