// Выбранный герой игрока: раса и специализация.
//
// По ним постройки решают, пускать ли к следующему тиру и какую цену просить
// (верфь строителю спускает корабль дешевле). Живёт отдельно, потому что нужен
// и постройкам, и кораблям.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";

export type CurrentHero = { race: string | null; spec: string | null };

/** Выбранный герой целиком: дереву уровней нужны id, уровень и потолок. */
export type SelectedHeroRow = {
  id: string;
  name: string;
  level: number;
  rarity: string;
};

/** Выбранный герой игрока со всеми полями — для прокачки у дерева. */
export async function selectedHeroRow(wallet: string): Promise<SelectedHeroRow | null> {
  const list = sqlStr(await raidOwner(wallet));
  const rows = (await mcpExec(
    `SELECT h.id, h.level, h.rarity,
            COALESCE(NULLIF(t.name, ''), 'Герой') AS name
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.account_id IN (${list}) AND h.selected_at IS NOT NULL
      ORDER BY h.selected_at DESC LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    id: string;
    level: number | string;
    rarity: string;
    wallet: string;
    name: string;
  }>;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    level: Number(row.level) || 1,
    rarity: String(row.rarity ?? "rare"),
    wallet: row.wallet,
  };
}

export async function selectedHero(wallet: string): Promise<CurrentHero | null> {
  const list = sqlStr(await raidOwner(wallet));
  const rows = (await mcpExec(
    `SELECT t.race, t.specialization
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.account_id IN (${list}) AND h.selected_at IS NOT NULL
      ORDER BY h.selected_at DESC LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ race: string | null; specialization: string | null }>;
  const row = rows?.[0];
  return row ? { race: row.race ?? null, spec: row.specialization ?? null } : null;
}
