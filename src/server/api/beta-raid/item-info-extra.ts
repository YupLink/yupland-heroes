// Подробности для товаров, которых нет в mystic_item_template.
//
// «i» в маркете висит на арте, герое, боссе и своём товаре, а карточку раньше
// умел собирать только справочник артефактов — у босса и своего товара шторка
// открывалась пустой. Здесь два недостающих источника; ключ выбираем по
// префиксу id, он у каждого справочника свой (rbt_ / cst_).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { AbilityCfg } from "./abilities";
import { parseBoostEffects, type BoostEffect } from "@/lib/hero/boost";

export type BossBrief = {
  hp: number | null;
  damage: string | null;
  abilities: AbilityCfg[];
};

const one = async (sql: string): Promise<Record<string, unknown> | null> => {
  const rows = (await mcpExec(sql, { wrapJson: true }).catch(() => [])) as Array<
    Record<string, unknown>
  >;
  return rows?.[0] ?? null;
};

/** Босс с витрины: имя, картинка, уровень и то, чем он бьёт. */
export async function bossBrief(id: string): Promise<
  | (BossBrief & {
      name: string;
      imageUrl: string | null;
      level: number | null;
      land: string | null;
    })
  | null
> {
  const r = await one(
    `SELECT name, image_url, level, land, max_hp, damage, abilities
       FROM yuplink.raid_boss_template WHERE id = ${sqlStr(id)} LIMIT 1;`,
  );
  if (!r) return null;
  const raw = Array.isArray(r.abilities) ? (r.abilities as AbilityCfg[]) : [];
  return {
    name: String(r.name ?? ""),
    imageUrl: r.image_url ? String(r.image_url) : null,
    level: r.level == null ? null : Number(r.level),
    land: r.land ? String(r.land) : null,
    hp: r.max_hp == null ? null : Number(r.max_hp),
    damage: r.damage ? String(r.damage) : null,
    abilities: raw.filter((a) => a && typeof a.kind === "string"),
  };
}

/** Свой товар: кроме имени и картинки у него есть только описание от админа. */
export async function customBrief(id: string): Promise<{
  name: string;
  imageUrl: string | null;
  description: string | null;
  /** Прибавки к характеристикам, если товар — буст. Пусто у обычных. */
  boost: BoostEffect[];
} | null> {
  const r = await one(
    `SELECT name, image, description, boost
       FROM yuplink.raid_custom_item WHERE id = ${sqlStr(id)} LIMIT 1;`,
  );
  if (!r) return null;
  return {
    name: String(r.name ?? ""),
    imageUrl: r.image ? String(r.image) : null,
    description: r.description ? String(r.description) : null,
    boost: parseBoostEffects(r.boost),
  };
}
