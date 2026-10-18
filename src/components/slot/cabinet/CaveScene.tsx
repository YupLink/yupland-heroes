import { useEffect, useRef, useState } from "react";
import { SUPER_ATTEMPTS, SUPER_PRIZE } from "@/lib/slot/bonus";
import { FindArt, Finds } from "./Finds";
import { YupikSprite, type Motion } from "./YupikSprite";
import { num, text, useTimeline, vars, type SceneProps } from "./shared";
import { useFindFlight } from "./useFindFlight";

export function CaveScene({ state, act, ru, acting }: SceneProps) {
  const game = state.superGame!,
    timeline = useTimeline(),
    lock = useRef(false),
    mounted = useRef(true);
  const [busy, setBusy] = useState(false),
    [motion, setMotion] = useState<Motion>("idle"),
    [inside, setInside] = useState(false);
  const [pose, setPose] = useState({ x: 50, y: 74, width: 29, opacity: 1 }),
    [reveal, setReveal] = useState<0 | 1 | null>(game.lastSide);
  const scene = useRef<HTMLElement>(null),
    fly = useFindFlight();
  const [transitionError, setTransitionError] = useState<
    "bonus-close" | "super-next" | null
  >(null);
  const transition = async (type: "bonus-close" | "super-next") => {
    const res = await act({ type });
    if (!mounted.current) return null;
    if (!res) {
      setTransitionError(type);
      setBusy(false);
      lock.current = false;
      return null;
    }
    setTransitionError(null);
    if (type === "super-next") {
      setInside(false);
      setReveal(null);
      setPose({ x: 50, y: 74, width: 29, opacity: 1 });
    }
    return res;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!busy && !game.lastPick)
      scene.current
        ?.querySelector<HTMLButtonElement>(".cave-choice:not(:disabled)")
        ?.focus({ preventScroll: true });
  }, [busy, game.lastPick]);
  useEffect(() => {
    if (busy || transitionError || !game.lastPick) return;
    let active = true;
    setInside(true);
    setPose({
      x: game.lastSide === 0 ? 24.2 : 75.8,
      y: 49,
      width: 15,
      opacity: 0,
    });
    setReveal(game.lastSide);
    void timeline.wait(2100, true).then(async (ok) => {
      if (!ok || !active) return;
      const res = await transition(game.done ? "bonus-close" : "super-next");
      if (res && mounted.current && !game.done) {
        setInside(false);
        setReveal(null);
        setPose({ x: 50, y: 74, width: 29, opacity: 1 });
      }
    });
    return () => {
      active = false;
    };
  }, [game.lastPick, game.step, game.done, busy, transitionError]);
  const pick = async (side: 0 | 1) => {
    if (lock.current || acting || game.lastPick || game.done) return;
    lock.current = true;
    setBusy(true);
    setReveal(null);
    setMotion("walk");
    const portal = side === 0 ? 24.2 : 75.8;
    setPose({ x: portal, y: 54, width: 21, opacity: 1 });
    if (!(await timeline.wait(800))) return;
    setInside(true);
    setPose({ x: portal, y: 49, width: 15, opacity: 0 });
    if (!(await timeline.wait(600))) return;
    const result = await act({ type: "super-pick", side });
    if (!mounted.current) return;
    if (!result) {
      setInside(false);
      setPose({ x: 50, y: 74, width: 29, opacity: 1 });
      setMotion("idle");
      setBusy(false);
      lock.current = false;
      return;
    }
    const next = result.state.superGame!;
    setReveal(side);
    if (!(await timeline.wait(2300, true))) return;
    if (next.lastPick === "hit")
      await fly(scene.current, "magic", ".cave-prize-art");
    if (!mounted.current) return;
    if (next.done) {
      await transition("bonus-close");
      return;
    }
    if (!(await transition("super-next"))) return;
    if (!mounted.current) return;
    setReveal(null);
    setInside(false);
    setPose({ x: 50, y: 74, width: 29, opacity: 1 });
    setMotion("walk");
    if (!(await timeline.wait(800))) return;
    setMotion("idle");
    setBusy(false);
    lock.current = false;
  };
  const bear = game.lastPick === "miss";
  return (
    <section
      ref={scene}
      className="scene caves"
      aria-label={text(ru, "Пещеры", "Caves")}
    >
      <header className="scene-head">
        <h2>{text(ru, "Пещеры", "Caves")}</h2>
        <button
          className="scene-exit"
          disabled={acting}
          onClick={() => void act({ type: "bonus-close" })}
          aria-label={text(
            ru,
            "Завершить бонус и сохранить найденное",
            "Finish bonus and keep prizes",
          )}
        >
          ×
        </button>
      </header>
      <div className="scene-info">
        {busy && reveal === null
          ? text(
              ru,
              inside ? "Что скрывается внутри?.." : "Юпик идёт в пещеру…",
              inside ? "What is inside?.." : "Yupik is entering the cave…",
            )
          : text(
              ru,
              `Выбор ${Math.min(game.step + 1, SUPER_ATTEMPTS)} из ${SUPER_ATTEMPTS} · Выбери пещеру`,
              `Choice ${Math.min(game.step + 1, SUPER_ATTEMPTS)} of ${SUPER_ATTEMPTS} · Choose a cave`,
            )}
      </div>
      <div className="cave-choices">
        {([0, 1] as const).map((side) => (
          <button
            key={side}
            className={"cave-choice" + (busy ? " is-entering" : "")}
            data-cave={side}
            disabled={busy || acting || !!game.lastPick || game.done}
            onClick={() => void pick(side)}
          >
            <span>
              {text(ru, "Пещера", "Cave")} {side + 1}
            </span>
          </button>
        ))}
        <div
          className={"cave-character" + (inside ? " is-entering" : "")}
          style={{
            ...vars({
              "--cave-x": pose.x + "%",
              "--cave-y": pose.y + "%",
              "--cave-width": pose.width + "%",
            }),
            opacity: pose.opacity,
          }}
        >
          {!inside && <YupikSprite motion={motion} />}
        </div>
        {reveal !== null && (
          <div
            className={"cave-reveal " + (bear ? "is-bear" : "is-chest")}
            style={vars({
              "--portal-x": reveal === 0 ? "24.2%" : "75.8%",
              "--reveal-shift": reveal === 0 ? "8%" : "-8%",
            })}
          >
            <FindArt
              kind={bear ? "bear" : "magic"}
              className="cave-prize-art"
            />
          </div>
        )}
      </div>
      <div className="scene-result" role="status">
        {reveal !== null && (
          <>
            <strong>
              {text(
                ru,
                bear ? "Медведь!" : "Большой сундук",
                bear ? "Bear!" : "Large chest",
              )}
            </strong>
            <span>
              {bear
                ? text(
                    ru,
                    "Найденное остаётся у тебя",
                    "You keep everything collected",
                  )
                : "+" +
                  num(SUPER_PRIZE * state.bonusStake, ru) +
                  " · ×" +
                  SUPER_PRIZE +
                  text(ru, " ставки за спин", " spin bet")}
            </span>
          </>
        )}
      </div>
      <Finds state={state} ru={ru} excludeLast={reveal !== null && !bear} />
      {transitionError && (
        <div className="scene-retry" role="alert">
          <p>{text(ru, "Не удалось продолжить", "Could not continue")}</p>
          <button
            disabled={acting}
            onClick={() => void transition(transitionError)}
          >
            {text(ru, "Повторить", "Retry")}
          </button>
        </div>
      )}
    </section>
  );
}
