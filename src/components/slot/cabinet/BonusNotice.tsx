import { useEffect, useRef } from "react";
import { asset, num, text, vars, type SceneProps } from "./shared";
import { Finds } from "./Finds";

export function BonusNotice({ act, ru, acting }: SceneProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    // Warm only the next scene while the announcement is on screen.
    for (const name of [
      "bonus-dig-clean-2026-10-16.webp",
      "dig-mounds-atlas-2026-10-16.webp",
      "yupik-dig-actions-2026-10-16.webp",
    ]) {
      const image = new Image();
      image.src = asset(name);
      void image.decode().catch(() => {});
    }
  }, []);
  return (
    <dialog
      ref={dialog}
      className="bonus-intro"
      aria-labelledby="bonus-intro-title"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="bonus-intro-sparks" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i
            key={i}
            style={vars({
              "--spark-x": i * 8 + 3 + "%",
              "--spark-time": 2.4 + (i % 3) * 0.4 + "s",
              "--spark-delay": -i * 0.3 + "s",
            })}
          />
        ))}
      </div>
      <div className="bonus-intro-content">
        <p className="bonus-intro-kicker">{text(ru, "Ура!", "Hooray!")}</p>
        <h2 id="bonus-intro-title" className="bonus-intro-title">
          <span>{text(ru, "Бонусная", "Bonus")}</span>
          <span>{text(ru, "игра!", "game!")}</span>
        </h2>
        <div className="bonus-intro-yupiks" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <img key={i} src={asset("yupik-shovel.webp")} alt="" />
          ))}
        </div>
        <p className="bonus-intro-copy">
          {text(
            ru,
            "Три Юпика открывают путь к сокровищам",
            "Three Yupiks open the way to treasure",
          )}
        </p>
        <button
          className="bonus-intro-start"
          autoFocus
          disabled={acting}
          onClick={() => void act({ type: "bonus-enter" })}
        >
          {text(ru, "Начать раскопки", "Start digging")}
        </button>
      </div>
    </dialog>
  );
}
export function BonusEnd({ state, act, ru, acting }: SceneProps) {
  return (
    <section
      className="scene dig bonus-summary"
      aria-label={text(ru, "Итог бонуса", "Bonus result")}
    >
      <div className="bonus-summary-content">
        <h2>{text(ru, "Найденное — твоё!", "The treasure is yours!")}</h2>
        <strong>{num(state.bonusTotal, ru)}</strong>
        <button
          className="bonus-intro-start"
          disabled={acting}
          onClick={() => void act({ type: "bonus-finish" })}
        >
          {text(ru, "Забрать", "Collect")}
        </button>
      </div>
      <Finds state={state} ru={ru} />
    </section>
  );
}
