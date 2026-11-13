// Героическое на экране рейда: одно место, где решается, включён ли режим.
//
// Вынесено из BetaRaidScreen не ради красоты: экран и без того упирался в 249
// строк при лимите 250. Заодно развилка «есть герой / нет героя» перестала
// расползаться по компонентам — её видно целиком здесь.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RaidState } from "./useBetaRaidData";
import { onMineBuildStart } from "./mine-build/mineBuildStore";
import { onTreeMapStart } from "./tree-map/treeMapEvents";
import { onHandStart } from "./hand/handStore";
import { onLadderStart } from "./sight/ladderMode";

/**
 * Сколько «камера считается наведённой на героя» после первого нажатия.
 *
 * Спросить камеру напрямую нельзя: она живёт в ref'ах канваса и в React не
 * поднимается вовсе (useCanvasViewport — специально, чтобы не перерисовывать
 * дерево 60 раз в секунду). Поэтому наведение определяется по факту: первое
 * нажатие САМО привело камеру к герою, и пока герой не сошёл с клетки, а игрок
 * не отвлёкся дольше этого срока, камера там и стоит. Утащил карту пальцем и
 * вернулся через полминуты — нажатие снова работает прицелом, а не окном.
 */
const AIMED_MS = 6000;

export type RaidHeroUi = {
  /**
   * Режим героя включён. Признак один — блок hero в состоянии рейда: сервер
   * присылает его ТОЛЬКО под флагом hero_power, поэтому массовому игроку поля
   * не достаётся вовсе и экран ведёт себя ровно как раньше.
   */
  enabled: boolean;
  /** Игрок у замка: только там открывается вход внутрь. */
  atCastle: boolean;
  /** Скидка героя на шаг, в ПРОЦЕНТАХ — цену клетки считает shipRules. */
  stepDiscount: number;
  /** Окно выбора героя — прежнее поведение, живёт только без режима. */
  picker: boolean;
  openPicker: () => void;
  closePicker: () => void;
  /**
   * Окно замка: герой, отряд, снаряжение. Отряд там — ПАМЯТЬ, а не запрет:
   * состав на бой игрок по-прежнему собирает в окне боя.
   */
  castle: boolean;
  openCastle: () => void;
  closeCastle: () => void;
  /**
   * Окно героя прямо с карты: снаряжение и уровень без похода в замок.
   * Владелец: «сменить одежду и прокачать уровень можно ВСЕГДА».
   */
  quick: boolean;
  closeQuick: () => void;
  /**
   * Нажатие на кнопку героя. Первое — везёт камеру (center), второе, пока
   * камера у героя, — открывает окно героя. Центрирование остаётся за HUD:
   * координаты и сама камера есть только там.
   */
  pressHero: (center: () => void) => void;
};

export function useRaidHeroUi(state: RaidState | undefined): RaidHeroUi {
  const [picker, setPicker] = useState(false);
  const [castle, setCastle] = useState(false);
  const [quick, setQuick] = useState(false);
  // Когда и на какой клетке камеру наводили в последний раз. В ref, а не в
  // state: от этих значений ничего не рисуется, а перерисовка карты на каждое
  // нажатие была бы платой ни за что.
  const aimedAt = useRef(0);
  const aimedCell = useRef("");
  // «Поставить» шахту из рюкзака в окне замка — окно уходит, карта в режиме
  // стройки. Окно героя (HeroQuickModal) закрывается само, откуда бы ни открыли.
  useEffect(() => onMineBuildStart(() => setCastle(false)), []);
  useEffect(() => onHandStart(() => setCastle(false)), []);
  useEffect(() => onLadderStart(() => setCastle(false)), []);
  useEffect(() => onTreeMapStart(() => setCastle(false)), []);

  const pos = state?.position;
  const cell = pos ? `${pos.q},${pos.r}` : "";
  // Читаем клетку в колбэке через ref: иначе pressHero пересоздавался бы на
  // каждый шаг героя и тянул за собой перерисовку memo-HUD.
  const cellRef = useRef(cell);
  cellRef.current = cell;

  const pressHero = useCallback((center: () => void) => {
    const here = cellRef.current;
    const aimed =
      here !== "" && aimedCell.current === here && Date.now() - aimedAt.current < AIMED_MS;
    if (aimed) {
      setQuick(true);
      return;
    }
    aimedAt.current = Date.now();
    aimedCell.current = here;
    center();
  }, []);

  const closeQuick = useCallback(() => {
    setQuick(false);
    // Камера никуда не уехала, пока окно было открыто: продлеваем наведение,
    // чтобы следующее нажатие сразу вернуло окно, а не «навело» второй раз.
    aimedAt.current = Date.now();
  }, []);

  const openPicker = useCallback(() => setPicker(true), []);
  const closePicker = useCallback(() => setPicker(false), []);
  const openCastle = useCallback(() => setCastle(true), []);
  const closeCastle = useCallback(() => setCastle(false), []);

  const hero = state?.hero;
  const enabled = !!hero;
  const atCastle = !!hero?.atCastle;
  const stepDiscount = hero?.stepDiscount ?? 0;
  const castleOpen = castle && !!hero;
  const quickOpen = quick && !!hero;
  // Один объект на неизменный набор полей: карта держит его в пропсах HUD
  // (memo), и новый литерал на каждый рендер ломал бы memo впустую.
  return useMemo(
    () => ({
      enabled,
      atCastle,
      stepDiscount,
      picker,
      openPicker,
      closePicker,
      castle: castleOpen,
      openCastle,
      closeCastle,
      quick: quickOpen,
      closeQuick,
      pressHero,
    }),
    [
      enabled,
      atCastle,
      stepDiscount,
      picker,
      openPicker,
      closePicker,
      castleOpen,
      openCastle,
      closeCastle,
      quickOpen,
      closeQuick,
      pressHero,
    ],
  );
}

