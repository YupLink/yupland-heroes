// Бой на экране. Ход считает движок сразу, а экран проигрывает его раскадровку
// (идёт, бьёт, всплывает урон) и только потом переходит на новое состояние.
// Пока раскадровка идёт, поле нажатий не принимает, компьютер ждёт.
// До боя — расстановка (Ярослав 08.11: «самый старт — расставить воинов»): нажал
// своего бойца — выбран, нажал клетку своей зоны — встал туда; «В бой» — начали.
import { useEffect, useMemo, useRef, useState } from "react";
import { act, inDeployZone, notStarted, offerWait, redeploy } from "@/lib/duel/engine";
import { samePos } from "@/lib/duel/grid";
import { acceptsOffer, aiAction } from "@/lib/duel/ai";
import {
  allies,
  bestStand,
  current,
  enemies,
  inShot,
  moveCells,
  shooter,
} from "@/lib/duel/options";
import type { Action, DuelState, OfferKind, Pos, Side, SpellId, Unit } from "@/lib/duel/types";
import { buildTimeline, type Timeline } from "./fx/timeline";
import { planAction, planFor, type Plan } from "./fx/plan";
import type { XY } from "./fx/layout";
import { fxOf, liveFx, type Fx } from "./canvas/effects";

/** Компьютер думает чуть-чуть: видно, что ход перешёл к нему. */
const AI_PAUSE_MS = 450;

export type Anim = { prev: DuelState; tl: Timeline; start: number };

export function useDuelBattle(
  initial: DuelState,
  ai: Record<Side, boolean>,
  /** Перестановка до боя — наверх (страница помнит места при смене бойцов). */
  onDeployed?: (st: DuelState) => void,
  /** Бой, сохранённый до перезагрузки (duelSave), — продолжить с него. */
  resume?: DuelState | null,
  /** Каждый сыгранный ход — наверх (страница кладёт его в память вкладки). */
  onState?: (st: DuelState) => void,
) {
  const [st, setSt] = useState(resume ?? initial);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [spell, setSpell] = useState<SpellId | null>(null);
  const [deploying, setDeploying] = useState(() => !resume && notStarted(initial));
  const [picked, setPicked] = useState<string | null>(null);
  const fx = useRef<Fx[]>([]);
  // До боя состав меняется списком бойцов: поле не пересоздаём (без мигания), а
  // берём новый расклад — места уже учтены страницей.
  useEffect(() => {
    if (!deploying) return;
    setSt(initial);
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  /** Что на экране: во время раскадровки — состояние ДО хода. */
  const view = anim ? anim.prev : st;
  const unit = anim || deploying ? null : current(st);
  const human = !!unit && !ai[unit.side];
  /** Сторона человека — её бойцов он расставляет. */
  const mySide: Side = ai.a ? "b" : "a";

  // Ход считаем здесь, а не внутри setSt: ошибку из функции-обновления React
  // бросает уже при отрисовке, и неверный ход ронял бы страницу.
  const play = (a: Action): boolean => {
    let next: DuelState;
    try {
      next = act(st, a);
    } catch {
      return false;
    }
    const start = performance.now();
    const tl = buildTimeline(st, a, next);
    fx.current = [...liveFx(fx.current, start), ...fxOf(tl, st, start)];
    setAnim({ prev: st, tl, start });
    setSt(next);
    setSpell(null);
    return true;
  };

  // Бой идёт — каждый ход в память вкладки (после раскадровки, без лишних записей).
  useEffect(() => {
    if (!deploying && !anim) onState?.(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, deploying, anim]);

  useEffect(() => {
    if (!anim) return;
    const left = anim.tl.duration - (performance.now() - anim.start);
    const id = setTimeout(() => setAnim(null), Math.max(0, left));
    return () => clearTimeout(id);
  }, [anim]);

  useEffect(() => {
    if (anim || !unit || human) return;
    const id = setTimeout(() => {
      const a = aiAction(st);
      if (a && !play(a)) play({ t: "defend" });
    }, AI_PAUSE_MS);
    return () => clearTimeout(id);
    // play — замыкание этого же рендера: st в нём тот же.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, anim, unit, human]);

  /** Куда идёт боец сейчас (только в ход человека и без заклинания). */
  const reach = useMemo(
    () => (unit && human && !spell ? moveCells(st, unit) : new Map<string, number>()),
    [st, unit, human, spell],
  );

  /** Кого можно ударить — или на кого наложить выбранное заклинание. */
  const targets = useMemo((): Unit[] => {
    if (!unit || !human) return [];
    if (spell) {
      return allies(st, unit.side);
    }
    return enemies(st, unit).filter((x) =>
      shooter(unit) ? inShot(unit, x) : bestStand(st, unit, x) !== null,
    );
  }, [st, unit, human, spell]);

  const plan = (cell: Pos, point: XY | null): Plan | null =>
    unit && human ? planFor(st, unit, spell, cell, point) : null;

  /** Расстановка: свой боец — выбрать; клетка своей зоны — поставить выбранного. */
  const deployTap = (cell: Pos): boolean => {
    const own = st.units.find((u) => u.side === mySide && u.hp > 0 && samePos(u.pos, cell));
    if (picked && inDeployZone(mySide, cell.c) && (!own || own.id !== picked)) {
      try {
        const next = redeploy(st, picked, cell);
        setSt(next);
        setPicked(null);
        onDeployed?.(next);
        return true;
      } catch {
        return false;
      }
    }
    if (!own) return false;
    setPicked(own.id === picked ? null : own.id);
    return true;
  };

  const startBattle = (): void => {
    setDeploying(false);
    setPicked(null);
  };

  const tap = (cell: Pos, point: XY): void => {
    if (deploying) {
      if (deployTap(cell)) {
        fx.current = [...fx.current, { k: "tap", at: performance.now(), x: point.x, y: point.y }];
      }
      return;
    }
    const p = plan(cell, point);
    if (!p) return;
    fx.current = [...fx.current, { k: "tap", at: performance.now(), x: point.x, y: point.y }];
    play(planAction(p));
  };

  const run = (a: Action): void => {
    if (human) play(a);
  };

  /**
   * Предложить противнику ничью или сдаться (владелец 09.11.2026: «кнопка предложить
   * ничью или поражение — а там на усмотрение противника»; «только через 10 ходов»).
   * В песочнице отвечает компьютер (acceptsOffer); ход не тратится.
   */
  const offerLeft = unit ? offerWait(st, unit.side) : 0;
  const offer = (what: OfferKind): void => {
    if (!unit || !human || offerLeft > 0) return;
    play({ t: "offer", what, accept: acceptsOffer(st, unit.side === "a" ? "b" : "a", what) });
  };

  return {
    st,
    view,
    anim,
    fx,
    unit,
    human,
    spell,
    setSpell,
    reach,
    targets,
    plan,
    tap,
    run,
    offer,
    offerLeft,
    deploying,
    picked,
    mySide,
    startBattle,
  };
}

export type DuelBattleState = ReturnType<typeof useDuelBattle>;
