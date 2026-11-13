// Окно храма, когда храма у игрока нет (ПРАВИЛА §8.64): с 22.10.2026 храм
// покупается в Ратуше. Здесь та же карточка покупки, что в Ратуше: купил —
// окно перечитывает храм и сразу открывает молитву, без перезагрузки.
import { TownHallTemple } from "../TownHallTemple";
import "../town-hall.css";
import "./temple-live.css";

export function TempleNotOwned({ ru, onBack }: { ru: boolean; onBack: () => void }) {
  return (
    <main
      className="temple-live"
      style={{ backgroundImage: 'linear-gradient(180deg,rgba(4,6,13,.07),rgba(4,6,13,.25)),url("/temple/prayer-interior.webp")' }}
    >
      <div className="temple-live-content">
        <header className="temple-live-head">
          <button type="button" className="temple-live-back" onClick={onBack}>
            {ru ? "← Замок" : "← Castle"}
          </button>
          <div className="temple-live-title">
            <h1>{ru ? "Храм" : "Temple"}</h1>
          </div>
        </header>
        <section className="temple-live-panel space-y-3" aria-label={ru ? "Храм" : "Temple"}>
          <p className="text-sm text-[#e8dcc0]">
            {ru
              ? "Храма пока нет. Купи его — и молись раз в 6 часов, улучшай до 100-го уровня."
              : "You have no temple yet. Buy it to pray every 6 hours and upgrade it up to level 100."}
          </p>
          <TownHallTemple ru={ru} />
        </section>
      </div>
    </main>
  );
}
