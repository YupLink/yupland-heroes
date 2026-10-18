import { useEffect, useRef, useState } from "react";
import { findKind } from "@/lib/slot/bonus";
import { FindArt, Finds, findName } from "./Finds";
import { YupikSprite, type Motion } from "./YupikSprite";
import { num, text, useTimeline, vars, type SceneProps } from "./shared";
import { useFindFlight } from "./useFindFlight";

const rows = [
  { y: 930, width: 160, x: [190, 351, 512, 673, 834] },
  { y: 800, width: 146, x: [190, 351, 512, 673, 834] },
  { y: 670, width: 132, x: [205, 359, 512, 665, 819] },
  { y: 540, width: 120, x: [224, 368, 512, 656, 800] },
];
const sprites = [
  { x: 41, y: 198, w: 554, h: 373 },
  { x: 660, y: 197, w: 566, h: 375 },
  { x: 39, y: 812, w: 566, h: 355 },
];
export function DigScene({ state, act, ru, acting }: SceneProps) {
  const bonus = state.bonus!,
    scene = useRef<HTMLElement>(null),
    lock = useRef(false),
    timeline = useTimeline();
  const [busy, setBusy] = useState(false),
    [motion, setMotion] = useState<Motion>("idle");
  const [target, setTarget] = useState<number | null>(null),
    [outcome, setOutcome] = useState<number | null>(null);
  const [pose, setPose] = useState({ x: 50, y: 81.9, width: 34, facing: 1 });
  const fly = useFindFlight();
  const [transitionError, setTransitionError] = useState<
    "bonus-close" | "super-enter" | null
  >(null);
  const transition = async (type: "bonus-close" | "super-enter") => {
    const res = await act({ type });
    if (!res && scene.current) {
      setTransitionError(type);
      setBusy(false);
      lock.current = false;
    }
  };
  useEffect(() => {
    if (!busy)
      scene.current
        ?.querySelector<HTMLButtonElement>(".mound:not(:disabled)")
        ?.focus({ preventScroll: true });
  }, [bonus.row, busy]);
  useEffect(() => {
    const element = scene.current!;
    const resize = () => {
      if (target === null) {
        const rect = element.getBoundingClientRect(),
          last = bonus.picks.length - 1;
        if (last < 0)
          setPose({
            x: 50,
            y: 930 / 15.36 + ((34 * 0.82 + 2.5) * rect.width) / rect.height,
            width: 34,
            facing: 1,
          });
        else {
          const col = bonus.picks[last],
            width = 28 - last * 2,
            facing = col === 0 ? -1 : 1;
          setPose({
            x: rows[last].x[col] / 10.24 - (facing * width * 130) / 360,
            y:
              rows[last].y / 15.36 +
              (((width * 20) / 360) * rect.width) / rect.height,
            width,
            facing,
          });
        }
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [target, bonus.picks.length]);
  // A saved final pick resumes the transition; it never draws another prize.
  useEffect(() => {
    if (busy || transitionError || (!bonus.fell && bonus.row < 4)) return;
    let active = true;
    const last = bonus.picks.length - 1;
    setOutcome(bonus.board[last][bonus.picks[last]]);
    void timeline.wait(2100, true).then((ok) => {
      if (ok && active)
        void transition(bonus.fell ? "bonus-close" : "super-enter");
    });
    return () => {
      active = false;
    };
  }, [bonus.fell, bonus.row, busy, transitionError]);
  const pick = async (index: number) => {
    if (
      lock.current ||
      acting ||
      Math.floor(index / 5) !== bonus.row ||
      bonus.fell
    )
      return;
    lock.current = true;
    setBusy(true);
    setOutcome(null);
    setTarget(index);
    setMotion("walk");
    const col = index % 5,
      row = bonus.row,
      width = 28 - row * 2,
      facing = col === 0 ? -1 : 1;
    const box = scene.current!.getBoundingClientRect();
    setPose({
      x: rows[row].x[col] / 10.24 - (facing * width * 130) / 360,
      y: rows[row].y / 15.36 + (((width * 20) / 360) * box.width) / box.height,
      width,
      facing,
    });
    if (!(await timeline.wait(800))) return;
    setMotion("dig");
    if (!(await timeline.wait(1400))) return;
    setMotion("idle");
    const result = await act({ type: "bonus-pick", col });
    if (!scene.current) return;
    if (!result) {
      setTarget(null);
      setBusy(false);
      lock.current = false;
      return;
    }
    const next = result.state.bonus!,
      mult = next.board[row][col];
    setOutcome(mult);
    if (!(await timeline.wait(2100, true))) return;
    if (mult > 0) await fly(scene.current, findKind(mult), ".dig-outcome-art");
    if (!scene.current) return;
    setOutcome(null);
    setTarget(null);
    if (next.fell) {
      await transition("bonus-close");
      return;
    }
    if (next.row >= 4) {
      await transition("super-enter");
      return;
    }
    lock.current = false;
    setBusy(false);
  };
  const kind = outcome === 0 ? "trap" : findKind(outcome ?? 1);
  return (
    <section
      ref={scene}
      className={"scene dig" + (busy ? " dig-busy" : "")}
      aria-label={text(ru, "Раскопки", "Excavation")}
    >
      <header className="scene-head">
        <h2 className="sr-only">{text(ru, "Раскопки", "Excavation")}</h2>
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
        {text(ru, "Ряд", "Row")} {Math.min(4, bonus.row + 1)}{" "}
        {text(ru, "из", "of")} 4
      </div>
      <p className="dig-instruction">
        {busy
          ? text(
              ru,
              motion === "walk"
                ? "Юпик идёт к кучке…"
                : motion === "dig"
                  ? "Раскапывает…"
                  : "Находка!",
              motion === "walk"
                ? "Yupik is walking…"
                : motion === "dig"
                  ? "Digging…"
                  : "Found!",
            )
          : text(
              ru,
              bonus.row === 0
                ? "Выбери кучку в ближайшем ряду"
                : "Выбери кучку в подсвеченном ряду",
              "Choose a mound in the glowing row",
            )}
      </p>
      <div
        className="dig-character"
        data-motion={motion}
        style={vars({
          "--dig-x": pose.x + "%",
          "--dig-y": pose.y + "%",
          "--dig-width": pose.width + "%",
          "--dig-facing": pose.facing,
        })}
      >
        <YupikSprite motion={motion} />
      </div>
      <div className="mounds">
        {Array.from({ length: 20 }, (_, index) => {
          const row = Math.floor(index / 5),
            col = index % 5,
            r = rows[row],
            s = sprites[(col + row) % 3],
            chosen = bonus.picks[row] === col;
          const mult = chosen ? bonus.board[row][col] : -1,
            kind = mult === 0 ? "trap" : findKind(mult);
          const current = bonus.row === row && !bonus.fell;
          return (
            <button
              type="button"
              key={index}
              data-mound={index}
              disabled={!current || busy || acting}
              onClick={() => void pick(index)}
              className={
                "mound" +
                (chosen ? " open" : "") +
                (current ? " active-row" : "") +
                (target === index ? " digging-target" : "") +
                (target === index && motion === "dig" ? " excavating" : "")
              }
              aria-label={
                chosen
                  ? findName(kind, ru)
                  : text(
                      ru,
                      `Раскопать кучку ${col + 1}, ряд ${row + 1}`,
                      `Dig mound ${col + 1}, row ${row + 1}`,
                    )
              }
              style={vars({
                "--mound-x": r.x[col] / 10.24 + "%",
                "--mound-y": r.y / 15.36 + "%",
                "--mound-width": r.width / 10.24 + "%",
                "--mound-height": (r.width * s.h) / s.w / 15.36 + "%",
                "--sprite-ratio": s.w + "/" + s.h,
                "--sprite-size":
                  (1254 / s.w) * 100 + "% " + (1254 / s.h) * 100 + "%",
                "--sprite-position":
                  (s.x / (1254 - s.w)) * 100 +
                  "% " +
                  (s.y / (1254 - s.h)) * 100 +
                  "%",
              })}
            >
              <span className="mound-art" />
              <span className="mound-find">
                {chosen && <FindArt kind={kind} />}
              </span>
            </button>
          );
        })}
      </div>
      <Finds
        state={state}
        ru={ru}
        excludeLast={outcome !== null && outcome > 0}
      />
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
      <div
        className={
          "scene-result" +
          (outcome !== null ? " is-result" : "") +
          (outcome === 0 ? " is-trap" : "")
        }
        role="status"
      >
        {outcome !== null && (
          <>
            <FindArt kind={kind} className="dig-outcome-art" />
            <strong className="dig-outcome-title">{findName(kind, ru)}</strong>
            <span className="dig-outcome-detail">
              {outcome === 0
                ? text(
                    ru,
                    "Найденное остаётся у тебя",
                    "You keep everything collected",
                  )
                : "+" +
                  num(outcome * state.bonusStake, ru) +
                  " · ×" +
                  outcome +
                  text(ru, " ставки за спин", " spin bet")}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
