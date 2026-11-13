// Кнопки «i» и «Атаковать» над картой ↔ экран рейда.
//
// Кнопка живёт в HUD внутри холста (BetaRaidHud, memo), а окно цели — на
// экране рейда. Тянуть цель и колбэк пропсами через холст — будить кадр карты
// на каждый удар; поэтому — крошечный стор: экран кладёт сюда выбранную цель
// рядом и «идёт ли бой», кнопки читают и зовут окно цели или удар.
import { useSyncExternalStore } from "react";
import type { FightTarget } from "./fightControl";

type Snap = { target: FightTarget | null; busy: boolean };

const NONE: Snap = { target: null, busy: false };
let snap: Snap = NONE;
let opener: ((t: FightTarget) => void) | null = null;
let attacker: ((t: FightTarget) => void) | null = null;
const subs = new Set<() => void>();

const same = (a: FightTarget | null, b: FightTarget | null) =>
  a === b || (!!a && !!b && a.objectId === b.objectId && a.q === b.q && a.r === b.r);

/** Выбранная цель рядом (null — кнопок нет) и идёт ли удар. Одинаковое не будит подписчиков. */
export function publishFightInfo(target: FightTarget | null, busy: boolean): void {
  if (same(snap.target, target) && snap.busy === busy) return;
  snap = target || busy ? { target, busy } : NONE;
  for (const f of subs) f();
}

/** Чем открыть окно цели; null — экран рейда ушёл. */
export function setFightInfoOpener(fn: ((t: FightTarget) => void) | null): void {
  opener = fn;
}

/** Чем бить по выбранной цели; null — экран рейда ушёл. */
export function setFightAttacker(fn: ((t: FightTarget) => void) | null): void {
  attacker = fn;
}

/** Тап по «i»: окно цели, что сейчас выбрана. */
export function openFightInfo(): void {
  if (snap.target && opener) opener(snap.target);
}

/** Тап по «Атаковать»: удар по выбранной цели. */
export function attackFight(): void {
  if (snap.target && attacker) attacker(snap.target);
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function useFightInfo(): Snap {
  return useSyncExternalStore(
    subscribe,
    () => snap,
    () => NONE,
  );
}
