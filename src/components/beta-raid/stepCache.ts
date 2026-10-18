// Оптимистичные записи шага в кэш: позиция героя, энергия и откат.
//
// Вынесено из useBetaMovement (правило ≤250 строк): там остались маршруты и
// сам шаг, здесь — как шаг ложится в кэш до ответа сервера.
import type { QueryClient } from "@tanstack/react-query";
import { ENERGY_KEY, type EnergyData } from "@/lib/hooks/useEnergy";
import type { RaidState } from "./useBetaRaidData";

export const STATE_KEY = ["beta-raid-state"];

export function makeStepCache(qc: QueryClient) {
  /**
   * Энергия на экране одна на всё приложение — правим и общий кэш шапки.
   *
   * Летящий фоновый рефетч отменяем, иначе он вернёт до-списочное число уже
   * после нашей записи. `updatedAt` держим прежним: шапка по нему считает,
   * когда капнет следующая единица, а от «свежей» метки таймер отматывало назад.
   */
  const setSharedEnergy = (next: (prev: number) => number) => {
    void qc.cancelQueries({ queryKey: ENERGY_KEY });
    const updatedAt = qc.getQueryState(ENERGY_KEY)?.dataUpdatedAt;
    qc.setQueryData(
      ENERGY_KEY,
      (old: EnergyData | undefined) => (old ? { ...old, energy: next(old.energy) } : old),
      updatedAt ? { updatedAt } : undefined,
    );
  };

  /**
   * Запись в состояние рейда с ПРЕЖНЕЙ меткой свежести.
   *
   * Догадка клиента не делает данные новее ответа сервера — метку двигает
   * только настоящий запрос (в конце маршрута он и идёт). Заодно это держит
   * персист кэша в покое: он пишет в localStorage весь кэш вместе с картой на
   * 274 КБ, а шаг героя — несколько записей подряд (см. lib/persistIfChanged).
   */
  const patchState = (patch: (old: RaidState) => RaidState) => {
    const updatedAt = qc.getQueryState(STATE_KEY)?.dataUpdatedAt;
    qc.setQueryData(
      STATE_KEY,
      (old: RaidState | undefined) => (old ? patch(old) : old),
      updatedAt ? { updatedAt } : undefined,
    );
  };

  return {
    /** Снимок «как было» — на случай отказа сервера. */
    snapshot: () => qc.getQueryData<RaidState>(STATE_KEY),

    /** Оптимистично переставить героя и списать энергию (и сытость героя). */
    applyStep: (q: number, r: number, cost: number, satietyCost = 0) => {
      patchState((old) => ({
        ...old,
        position: { q, r },
        energy: Math.max(0, old.energy - cost),
        hero: spendSatiety(old.hero, satietyCost),
      }));
      setSharedEnergy((prev) => Math.max(0, prev - cost));
    },

    /** Сервер прислал шкалу сытости после шага — она точнее догадки. */
    applyServerSatiety: (satiety: { now: number; max: number; hungry: boolean }) => {
      patchState((old) => (old.hero ? { ...old, hero: { ...old.hero, satiety } } : old));
    },

    /** Сервер ответил — подтягиваем его цифру энергии (позиция уже наша). */
    applyServerEnergy: (energy: number) => {
      patchState((old) => ({ ...old, energy }));
      setSharedEnergy(() => energy);
    },

    rollback: (snapshot: RaidState | undefined) => {
      // Шаг не прошёл — сразу возвращаем списанное, не дожидаясь ответа сети.
      if (snapshot) {
        qc.setQueryData(STATE_KEY, snapshot);
        setSharedEnergy(() => snapshot.energy);
      }
      qc.invalidateQueries({ queryKey: STATE_KEY });
      qc.invalidateQueries({ queryKey: ENERGY_KEY });
    },
  };
}

/** Шкала сытости минус цена шага — догадка до ответа сервера. */
function spendSatiety(hero: RaidState["hero"], cost: number): RaidState["hero"] {
  const sat = hero?.satiety;
  if (!hero || !sat || cost <= 0) return hero;
  const now = Math.max(0, sat.now - cost);
  return { ...hero, satiety: { ...sat, now, hungry: now <= 0 } };
}
