// Чтение охранника шахты: строка raid_mine_guard, признак «жив» и публичный
// вид для окна шахты. Вынесено из mine-guard.ts (установка охранника), когда
// тот перерос лимит на размер файла.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { parseAbilities, type AbilityCfg } from "./abilities";

/** Строка охранника в БД (сырые типы из mcp). */
export type GuardRow = {
  boss_template_id: string;
  owner_account: string;
  name: string;
  image: string | null;
  background: string | null;
  max_hp: number | string;
  current_hp: number | string;
  damage: string | null;
  abilities: unknown;
  interaction_cost: number | string;
  killed_at: string | null;
  /** Когда поставлен — ключ боя для износа артефактов (art-wear-hit). */
  placed_at?: string | null;
};

/** Публичный вид охранника для окна шахты. */
export type MineGuardView = {
  templateId: string;
  name: string;
  image: string | null;
  background: string | null;
  maxHp: number;
  currentHp: number;
  alive: boolean;
  damage: string | null;
  /**
   * Как в encounter-peek: «10-20» отдаём строкой. Number("10-20") давал 0, и
   * блок «Опасности» у охранника показывал «−0» без длительности.
   */
  abilities: Array<{
    kind: string;
    chance: number;
    value: string | number;
    duration: string | number;
  }>;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Способность в вид карточки: диапазоны не трогаем, их разбирает клиент. */
export const abilityView = (a: AbilityCfg): MineGuardView["abilities"][number] => ({
  kind: String(a.kind ?? ""),
  chance: Number(a.chance) || 0,
  value: a.value ?? 0,
  duration: a.duration ?? 0,
});

/** Текущий охранник клетки (жив или недавно повержен). null — не ставили. */
export async function loadGuardRow(mapId: string, q: number, r: number): Promise<GuardRow | null> {
  const rows = (await mcpExec(
    `SELECT boss_template_id, owner_account, name, image, background, max_hp, current_hp,
            damage, abilities, interaction_cost, killed_at, placed_at
       FROM yuplink.raid_mine_guard
      WHERE map_id=${sqlStr(mapId)} AND q=${q} AND r=${r} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as GuardRow[];
  return rows?.[0] ?? null;
}

/** Жив ли охранник: строка есть, не помечен убитым и HP > 0. */
export function guardAlive(g: GuardRow | null): boolean {
  return !!g && g.killed_at == null && num(g.current_hp) > 0;
}

/** Вид охранника для UI, если он ЖИВ (иначе null — рисовать и биться не с кем). */
export function guardViewIfAlive(g: GuardRow | null): MineGuardView | null {
  if (!guardAlive(g) || !g) return null;
  return {
    templateId: g.boss_template_id,
    name: g.name,
    image: g.image,
    background: g.background,
    maxHp: num(g.max_hp),
    currentHp: num(g.current_hp),
    alive: true,
    damage: g.damage,
    // Способности выкапываем тем же парсером, что использует бой охранника —
    // одна кривая, чтобы блок «Опасности» показывал ровно то, что применится.
    abilities: guardAbilities(g).map(abilityView),
  };
}

/** Хелпер для mine-guard-attack: способности охранника (устойчиво к строке/массиву). */
export function guardAbilities(g: GuardRow): AbilityCfg[] {
  return parseAbilities(g.abilities);
}
