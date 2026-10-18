// Свёрнутый блок «Прошедшие» под живыми лотами (владелец, 14.10.2026):
// закрыт по умолчанию, раскрывается нажатием. Классы — auction-past.css.
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./auction-past.css";

export function PastSection({
  en,
  count,
  children,
}: {
  en: boolean;
  /** Сколько внутри; null — ещё не знаем (список грузится при раскрытии). */
  count?: number | null;
  children: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="auction-past">
      <button
        type="button"
        className="auction-past__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {en ? "Past" : "Прошедшие"}
        {count != null && <span className="auction-past__count">{count}</span>}
        <ChevronDown
          className={`auction-past__chev${open ? " auction-past__chev--open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && children(open)}
    </section>
  );
}
