import { useEffect, useRef, useState, type ComponentType } from "react";

type Load<P> = () => Promise<{ default: ComponentType<P> }>;
type Result<P> = { status: "loading" | "error"; Component?: never } | { status: "ready"; Component: ComponentType<P> };

/** Load an optional HUD dialog only while it is open. Late results after close are ignored. */
export function HudAsyncDialog<P extends object>({ load, props, onClose, ru }: {
  load: Load<P>;
  props: P;
  onClose: () => void;
  ru: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<P>>({ status: "loading" });
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setResult({ status: "loading" });
    void load().then(
      ({ default: Component }) => { if (active) setResult({ status: "ready", Component }); },
      () => { if (active) setResult({ status: "error" }); },
    );
    return () => { active = false; };
  }, [load, attempt]);

  useEffect(() => {
    if (result.status !== "ready") closeButton.current?.focus();
  }, [result.status]);

  if (result.status === "ready") return <result.Component {...props} />;

  const failed = result.status === "error";
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true"
    aria-label={ru ? "Открытие окна" : "Opening dialog"}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    <div className="w-full max-w-xs rounded-2xl border border-[#b59a57] bg-[#101213] p-4 text-center text-[#f5efdc] shadow-2xl">
      <p role={failed ? "alert" : "status"}>{failed
        ? ru ? "Не удалось открыть окно. Попробуй ещё раз." : "Could not open the dialog. Try again."
        : ru ? "Загрузка…" : "Loading…"}</p>
      <div className="mt-4 flex justify-center gap-3">
        {failed && <button type="button" className="min-h-11 rounded-lg border border-[#b59a57] px-4 focus-visible:outline-2 focus-visible:outline-[#ffe08a]"
          onClick={() => setAttempt(value => value + 1)}>{ru ? "Повторить" : "Retry"}</button>}
        <button ref={closeButton} type="button" className="min-h-11 rounded-lg border border-[#b59a57] px-4 focus-visible:outline-2 focus-visible:outline-[#ffe08a]"
          onClick={onClose}>{failed ? ru ? "Закрыть" : "Close" : ru ? "Отмена" : "Cancel"}</button>
      </div>
    </div>
  </div>;
}
