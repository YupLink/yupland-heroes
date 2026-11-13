import { useBuildingWindowAudio } from '@/hooks/useBuildingWindowAudio';
// Окно банка на весь экран в дизайне замка (оформление окна аукциона). Открывается
// шиной (здание на площади или карточка в Ратуше), монтируется один раз в корне
// CastleGame. Порталом в body: внутри окна постройки fixed встал бы в его рамку.
// Содержимое грузится только при открытии — без банка этот код не нужен.
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/i18n";
import { closeBank, onBankToggle } from "@/lib/bankBus";
import "@/components/chips/auctions/auction-screen.css";
import "./bank-window.css";

const BankScreen = lazy(() => import("./BankScreen").then((m) => ({ default: m.BankScreen })));

export function BankOverlay() {
  const ru = useLang() !== "en";
  const [open, setOpen] = useState(false);
  useBuildingWindowAudio(open);
  useEffect(() => onBankToggle(setOpen), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBank();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <section className="auction-window" data-bank-overlay role="dialog" aria-modal="true" aria-label={ru ? "Банк" : "Bank"}>
      <header className="auction-topbar">
        <button type="button" className="auction-back" onClick={() => closeBank()}>
          <span className="bank-overlay__back-glyph" aria-hidden="true">‹</span>
          {ru ? "Замок" : "Castle"}
        </button>
        <h1>{ru ? "Банк" : "Bank"}</h1>
      </header>
      <div className="auction-body">
        <div className="auction-stage">
          <Suspense fallback={<p role="status">{ru ? "Загрузка…" : "Loading…"}</p>}>
            <BankScreen ru={ru} />
          </Suspense>
        </div>
      </div>
    </section>,
    document.body,
  );
}
