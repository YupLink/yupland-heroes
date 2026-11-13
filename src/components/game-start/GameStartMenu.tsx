// Меню входа новичка (Архан через владельца, 22.10.2026, #497194: «ты заходишь —
// как в стандартных играх, менюшка: старт игры… и на старте даёт выбрать расу
// одного из шести героев»). Стоит на заставке (GameLoadState, слот menu): та же
// сцена с логотипом, тот же Юпик, игра грузится под ней. Только новичку —
// вернувшийся игрок входит без меню (useStartMenu).
// «Сложность» — один вариант «Обычная», он и выбран; на игру не влияет
// (владелец, 22.10.2026: «ничего — просто должен быть»).
import type { InviteWho } from "@/lib/referralShare";
import { Suspense, lazy, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { GameStartOption } from "@/server/api/game-start";
import "./game-start.css";

// Окно выбора расы — отдельным куском, заранее грузим, пока новичок смотрит на меню.
const loadRacePick = () =>
  import("./GameStartRacePick").then((m) => ({ default: m.GameStartRacePick }));
const GameStartRacePick = lazy(loadRacePick);

export function GameStartMenu({
  options,
  invite = null,
  onDone,
}: {
  options: GameStartOption[];
  /** Позвал друг — «Подарок от…» в выборе расы (lib/referralShare). */
  invite?: InviteWho | null;
  /** Меню закрыто: игрок входит в игру. */
  onDone: () => void;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  // Выбирать не из кого — не пускаем молча без героя: говорим об этом,
  // и только тогда «Продолжить» без героя.
  const pick = options.length > 0;
  useEffect(() => {
    if (pick) void loadRacePick().catch(() => {});
  }, [pick]);
  const go = () => (pick ? setPicking(true) : onDone());
  return (
    <>
      <div className="game-start" data-start-menu="new">
        {!pick && (
          <p className="game-start__note" role="status">
            {t("start.no_heroes")}
          </p>
        )}
        <div
          className="game-start__difficulty"
          role="radiogroup"
          aria-label={t("start.difficulty")}
        >
          <span>{t("start.difficulty")}</span>
          <button type="button" role="radio" aria-checked="true" className="game-start__level">
            {t("start.difficulty_normal")}
          </button>
        </div>
        <button type="button" className="game-start__go" onClick={go}>
          {t(pick ? "start.new" : "start.continue")}
        </button>
      </div>
      {picking && (
        <Suspense fallback={null}>
          <GameStartRacePick
            options={options}
            invite={invite}
            onClose={() => setPicking(false)}
            onDone={onDone}
          />
        </Suspense>
      )}
    </>
  );
}
