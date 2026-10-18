// Конфиг шахты: что добывает (ресурс + сколько за час) и цена захвата в энергии.
// Хранится ПЛОСКО в building_config клетки (как levelPrices у дерева) —
// {resource, token?, yield, captureCost}. Ту же форму читает SQL raid_mine_settle
// (building_config->>'resource' и т.д.).
import type { MineResource } from "./buildingEffect";

export interface MineConfig {
  resource: MineResource;
  token: string | null;
  yield: number;
  captureCost: number;
  /** Предел часов добычи от захвата (лесопилка острова — 168); нет — без предела. */
  maxHours?: number | null;
}

const RESOURCES: readonly MineResource[] = [
  "likes",
  "tickets",
  "energy",
  "gold",
  "stone",
  "diamonds",
  "wood",
  "token",
];

function parse(raw: unknown): MineConfig | null {
  const o = (raw ?? {}) as Partial<MineConfig>;
  if (typeof o !== "object") return null;
  const resource = RESOURCES.includes(o.resource as MineResource)
    ? (o.resource as MineResource)
    : null;
  if (!resource) return null;
  const y = Math.round(Number(o.yield));
  if (!Number.isFinite(y) || y <= 0) return null;
  const cost = Math.round(Number(o.captureCost));
  return {
    resource,
    token: resource === "token" ? (o.token ?? null) : null,
    yield: y,
    captureCost: Number.isFinite(cost) && cost > 0 ? cost : 0,
    maxHours: Number(o.maxHours) > 0 ? Math.floor(Number(o.maxHours)) : null,
  };
}

/** Конфиг шахты из meta шаблона (запасной вариант). */
export function mineConfig(meta: unknown): MineConfig | null {
  return parse((meta as { mine?: unknown } | null)?.mine);
}

/** Конфиг шахты КЛЕТКИ (приоритет, плоско) → иначе шаблон. Как cellTreePrices. */
export function cellMineConfig(cellConfig: unknown, meta: unknown): MineConfig | null {
  return parse(cellConfig) ?? mineConfig(meta);
}

/** Черновик для редактора — без строгой валидации (yield может быть 0, пока вводят). */
export function mineConfigDraft(config: unknown): MineConfig {
  const o = (config ?? {}) as Partial<MineConfig>;
  const resource = RESOURCES.includes(o.resource as MineResource)
    ? (o.resource as MineResource)
    : "gold";
  return {
    resource,
    token: resource === "token" ? (o.token ?? null) : null,
    yield: Math.max(0, Math.round(Number(o.yield ?? 0))) || 0,
    captureCost: Math.max(0, Math.round(Number(o.captureCost ?? 0))) || 0,
  };
}
