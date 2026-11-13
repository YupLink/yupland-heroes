// Черновик точки спавна в окне админа и сборка того, что уходит в
// adminSaveSpawnPoint. Награда строки — та же форма, что у моба на клетке
// (RewardConfigEditor): null — «как у моба», черновик — «своя».
import type { SpawnWeather } from "@/lib/raid/mobSpawn";
import { MOB_SPAWN_DEFAULT } from "@/lib/raid/mobSpawn";
import { POINT_MAX_MOBS, pointMobTotal, type SpawnPointMob } from "@/lib/raid/spawnPoint";
import {
  fromDraftCfg,
  rewardDraftReady,
  toDraftCfg,
  type DraftConfig,
} from "@/components/admin/RewardConfigEditor";

export type MobDraft = {
  mob: string;
  count: number;
  weathers: SpawnWeather[];
  respawnMin: number;
  /** null — награда как у моба в шаблоне. */
  reward: DraftConfig | null;
};

export type PointDraft = { radius: number; mobs: MobDraft[] };

export const NEW_POINT_RADIUS = 3;

/** Новая строка: первый моб из списка, одна штука, любая погода. */
export const newMobDraft = (mob: string): MobDraft => ({
  mob,
  count: 1,
  weathers: [],
  respawnMin: MOB_SPAWN_DEFAULT.respawnMin,
  reward: null,
});

/** Строка с сервера → черновик. */
export const toMobDraft = (m: SpawnPointMob): MobDraft => ({
  mob: m.mob,
  count: m.count,
  weathers: m.weathers,
  respawnMin: m.respawnMin,
  reward: m.reward ? toDraftCfg(m.reward) : null,
});

/** Черновик → тело запроса; null — в форме ошибка (кнопка серая). */
export function pointPayload(d: PointDraft): { radius: number; mobs: SpawnPointMob[] } | null {
  if (!d.mobs.length || pointMobTotal(d.mobs) > POINT_MAX_MOBS) return null;
  if (d.mobs.some((m) => !m.mob || (m.reward && !rewardDraftReady(m.reward)))) return null;
  return {
    radius: d.radius,
    mobs: d.mobs.map((m) => ({
      mob: m.mob,
      count: m.count,
      weathers: m.weathers,
      respawnMin: m.respawnMin,
      // Форма отдаёт тот же вид наград, что пишет на клетку; сервер разбирает его сам.
      reward: m.reward ? (fromDraftCfg(m.reward) as SpawnPointMob["reward"]) : null,
    })),
  };
}
