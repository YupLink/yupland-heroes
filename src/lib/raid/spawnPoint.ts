// Точка спавна мобов (владелец, 04.11.2026 по голосу Ярослава: «поставил точку, в
// этой точке выбрал мобов, погоду, когда эти мобы спавнятся, частоту и фонд на
// моба … очень простая настройка»). Общие правила окна админа и сервера.
//
// Точка — клетка и радиус. В ней строки мобов: какой моб, сколько штук, в какую
// погоду (несколько; пусто — любая), через сколько встаёт убитый и награда (своя
// или как у моба в шаблоне). Сохранили — точка расставляет мобов по свободным
// клеткам радиуса записями возрождения (mob-spawn): дальше их ведёт тот же
// минутный проход — погода, возрождение, бродят в радиусе точки.
import type { RewardConfig } from "@/server/api/raid-shared";
import { RESPAWN_MIN, ROAM_CELLS, type SpawnWeather } from "./mobSpawn";

/** Радиус точки — он же «бродит на N клеток» (0 — только клетка точки). */
export const POINT_RADIUS = ROAM_CELLS;
/** Сколько штук одного моба в строке. */
export const POINT_COUNT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Всего мобов на точке — защита от опечатки. */
export const POINT_MAX_MOBS = 30;
/** Строк мобов на точке. */
export const POINT_MAX_ROWS = 10;
/** Шаг бродящих мобов точки, мин (как у «Возрождения» по умолчанию). */
export const POINT_STEP_MIN = 5;

export type SpawnPointMob = {
  /** Шаблон моба (raid_boss_template.id, без «boss:»). */
  mob: string;
  count: number;
  /** Пусто — любая погода. */
  weathers: SpawnWeather[];
  /** Через сколько минут встаёт убитый (RESPAWN_MIN). */
  respawnMin: number;
  /** Своя награда (как у объекта на клетке); null — как у моба в шаблоне. */
  reward: RewardConfig | null;
};

export type SpawnPointView = {
  id: string;
  q: number;
  r: number;
  radius: number;
  mobs: SpawnPointMob[];
  /** Записей возрождения (мест под мобов) и сколько мобов сейчас на карте. */
  slots: number;
  alive: number;
};

export const isPointRespawn = (v: number): boolean =>
  (RESPAWN_MIN as readonly number[]).includes(v);

/** Всего мобов в строках. */
export const pointMobTotal = (mobs: readonly Pick<SpawnPointMob, "count">[]): number =>
  mobs.reduce((n, m) => n + m.count, 0);

/**
 * Порядок расстановки: по кругу — по одному от каждой строки, пока не кончатся.
 * Мест мало — каждый моб строки всё равно получает своё место раньше вторых
 * штук соседних строк.
 */
export function placementOrder<T extends Pick<SpawnPointMob, "count">>(mobs: readonly T[]): T[] {
  const out: T[] = [];
  const left = mobs.map((m) => m.count);
  for (let round = 0; out.length < pointMobTotal(mobs); round += 1) {
    mobs.forEach((m, i) => {
      if (left[i] > 0) {
        out.push(m);
        left[i] -= 1;
      }
    });
    if (round > POINT_MAX_MOBS) break;
  }
  return out;
}
