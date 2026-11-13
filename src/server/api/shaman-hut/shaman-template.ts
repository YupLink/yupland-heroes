// Шаман — шаблон босса rbt_shaman (миграция shaman-02): имя, картинка, HP,
// урон и способности задаёт админ в редакторе босса, как у любого босса.
//
// Читаем строку шаблона САМИ, а не loadEncounterTarget: тот подставляет HP
// 10 000 вместо нуля (бой без настройки), а здесь ноль — это «характеристики не
// назначены», и шаман годится только для обряда погоды (владелец, 28.10.2026).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { parseRange } from "@/server/api/beta-raid/abilities";
import { SHAMAN_ART, SHAMAN_TEMPLATE_ID } from "@/lib/shamanHut";

export type ShamanTemplate = {
  id: string;
  name: string;
  image: string;
  /** Запас HP; 0 — не задан. */
  hp: number;
  /** Урон как в редакторе босса («80» / «80-120»); null — не задан. */
  attack: string | null;
  /** HP и урон заданы — шамана можно взять в рюкзак и поставить в охрану шахты. */
  guard: boolean;
};

/** Характеристики назначены: HP > 0 и урон больше нуля. */
export function shamanGuardReady(hp: number, attack: string | null): boolean {
  return hp > 0 && parseRange(attack ?? undefined)[1] > 0;
}

/** Шаблон шамана; null — шаблона нет (миграцию shaman-02 не накатили, админ удалил). */
export async function loadShamanTemplate(): Promise<ShamanTemplate | null> {
  const rows = (await mcpExec(
    `SELECT id, name, image_url, max_hp, damage
       FROM yuplink.raid_boss_template WHERE id = ${sqlStr(SHAMAN_TEMPLATE_ID)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    name: string | null;
    image_url: string | null;
    max_hp: number | string | null;
    damage: string | number | null;
  }> | null;
  const t = rows?.[0];
  if (!t) return null;
  const n = Number(t.max_hp);
  const hp = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const raw = t.damage == null ? "" : String(t.damage).trim();
  const attack = raw && parseRange(raw)[1] > 0 ? raw : null;
  return {
    id: t.id,
    name: (t.name ?? "").trim() || "Шаман",
    image: (t.image_url ?? "").trim() || SHAMAN_ART,
    hp,
    attack,
    guard: shamanGuardReady(hp, attack),
  };
}
