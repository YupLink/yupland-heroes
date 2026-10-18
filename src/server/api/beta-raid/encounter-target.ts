// Цель энкаунтера в ЕДИНОМ виде: босс, сундук и шахта — одно и то же.
//
// В админке у объектов карты уже задаются те же поля, что у босса:
//   maxHp, rewardConfig {fillers, packs, split}, interactionCost, badgeLabel.
// Отличаются только надписи и картинка — логика боя одна.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { parseAbilities, type AbilityCfg } from "./abilities";

export type EncounterKind = "boss" | "chest" | "mine" | "artifact";

export type EncounterTarget = {
  kind: EncounterKind;
  /** id шаблона (raid_boss_template / mystic_item_template) */
  templateId: string;
  name: string;
  imageUrl: string | null;
  backgroundUrl: string | null;
  /** Подпись на бейдже: «Босс» / «Сундук» / «Шахта» */
  badgeLabel: string;
  maxHp: number;
  /** Энергия за вход в бой */
  interactionCost: number;
  /** {fillers, packs, split} — та же структура, что у босса */
  rewardConfig: unknown;
  /** Яд/оглушение/удар по всем/замедление/выжигание — общий формат. */
  abilities: AbilityCfg[];
  /** Урон цели диапазоном («80» / «80-120»). Не задан — эталонные 80. */
  damage: string | number | null;
};

const DEFAULT_COST = 10;
/** Эталонный запас HP: им живёт и бой, и админское «погасить» (admin-defeat-sql). */
export const DEFAULT_MAX_HP = 10_000;

/** Тип по префиксу id (`boss:`/`chest:`/…) или по meta.type. */
export function encounterKindOf(rawId: string, meta: unknown): EncounterKind {
  const prefix = rawId.includes(":") ? rawId.split(":")[0] : "";
  if (prefix === "boss" || prefix === "chest" || prefix === "mine" || prefix === "artifact") {
    return prefix;
  }
  const t = (meta as Record<string, unknown> | null)?.type;
  if (t === "boss" || t === "chest" || t === "mine" || t === "artifact") return t;
  return "chest";
}

/** id без префикса: `chest:abc` → `abc`. */
export function stripPrefix(rawId: string): string {
  return rawId.includes(":") ? rawId.split(":").slice(1).join(":") : rawId;
}

const BADGE_BY_KIND: Record<EncounterKind, string> = {
  boss: "Босс",
  chest: "Сундук",
  mine: "Шахта",
  artifact: "Артефакт",
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Читает цель по id с гекс-клетки. Босс живёт в raid_boss_template,
 * остальное — в mystic_item_template. Наружу отдаём одну форму.
 */
export async function loadEncounterTarget(rawObjectId: string): Promise<EncounterTarget | null> {
  const id = stripPrefix(rawObjectId);
  const isBossId = rawObjectId.startsWith("boss:");

  if (isBossId) {
    const rows = (await mcpExec(
      `SELECT id, name, image_url, background_url, max_hp, reward_tiers, abilities, damage
         FROM yuplink.raid_boss_template WHERE id = ${sqlStr(id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{
      id: string;
      name: string;
      image_url: string | null;
      background_url: string | null;
      max_hp: number;
      reward_tiers: unknown;
      abilities: unknown;
      damage: string | null;
    }>;
    const b = rows?.[0];
    if (!b) return null;
    return {
      kind: "boss",
      templateId: b.id,
      name: b.name,
      imageUrl: b.image_url,
      // Фон боя лежит в своей колонке — раньше его тут теряли, и окно
      // босса выходило пустым, хотя в редакторе картинка была.
      backgroundUrl: b.background_url,
      badgeLabel: BADGE_BY_KIND.boss,
      maxHp: num(b.max_hp, DEFAULT_MAX_HP),
      interactionCost: DEFAULT_COST,
      rewardConfig: b.reward_tiers ?? null,
      abilities: parseAbilities(b.abilities),
      damage: b.damage ?? null,
    };
  }

  const rows = (await mcpExec(
    `SELECT id, name, kind, image_url, meta
       FROM yuplink.mystic_item_template WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    name: string;
    kind: string | null;
    image_url: string | null;
    meta: unknown;
  }>;
  const o = rows?.[0];
  if (!o) return null;

  const meta = (o.meta ?? {}) as Record<string, unknown>;
  const kind = encounterKindOf(rawObjectId, { type: o.kind ?? undefined });
  return {
    kind,
    templateId: o.id,
    name: o.name,
    imageUrl: o.image_url,
    backgroundUrl: (meta.backgroundUrl as string | null) ?? null,
    badgeLabel:
      (typeof meta.badgeLabel === "string" && meta.badgeLabel.trim()) || BADGE_BY_KIND[kind],
    maxHp: num(meta.maxHp, DEFAULT_MAX_HP),
    interactionCost: num(meta.interactionCost, DEFAULT_COST),
    rewardConfig: meta.rewardConfig ?? null,
    abilities: parseAbilities(meta.abilities),
    damage: (meta.damage as string | number | null | undefined) ?? null,
  };
}
