// Случайный приз бокса → конкретный (владелец, 04.11.2026): «любой арт по
// редкости, любого героя по редкости, любой товар».
//
// Выбор делается ОДИН раз — при открытии, вместе с броском шанса, — и
// записывается на бокс как обычный приз (itemTemplateId / customId). Сорвалась
// выдача — повтор выдаёт тот же предмет, а не бросает заново (mystic-open-core).
// Из подходящих каждый выпадает с равным шансом. Подходящих нет — «пусто».
// Как все случайные выдачи: уникальный арт генератора, арт лаборатории и кони не
// выпадают (crafted-sql), уникальный герой — только пока его ни у кого нет.
import { secureRandomInt as randomInt } from "@/lib/secureRandom";
import { heroRarityOf, type ItemRarity } from "@/lib/mysticKinds";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { droppable, notMount } from "./craft/crafted-sql";
import { takenUniqueIds } from "./heroes-unique";
import type { MysticTier } from "./mystic-pool";

type Named = { id: string; name: string };
type Hero = Named & { level: number | null };

/** Один из списка, равновероятно; пусто — null. */
export function pickOne<T>(list: readonly T[]): T | null {
  return list.length > 0 ? list[randomInt(0, list.length)] : null;
}

/** Герои этой редкости (по звёздам). */
export const heroesOf = (all: readonly Hero[], rarity: ItemRarity): Hero[] =>
  all.filter((h) => heroRarityOf(h.level) === rarity);

async function rows<T>(sql: string): Promise<T[]> {
  return ((await mcpExec(sql, { wrapJson: true })) ?? []) as T[];
}

/** Тир пула → тир с конкретным предметом. Конкретный тир — как есть; не из чего выбрать — null. */
export async function resolveTier(t: MysticTier): Promise<MysticTier | null> {
  if (t.kind === "artifact" && !t.itemTemplateId && t.artifactRarity) {
    const got = pickOne(
      await rows<Named>(
        `SELECT id, name FROM yuplink.mystic_item_template
          WHERE kind = 'artifact' AND active AND rarity = ${sqlStr(t.artifactRarity)}
            AND ${droppable()} AND ${notMount()}`,
      ),
    );
    return got ? { ...t, itemTemplateId: got.id, itemName: got.name } : null;
  }
  if (t.kind === "hero" && !t.itemTemplateId && t.heroRarity) {
    const all = await rows<Hero>(
      `SELECT id, name, level FROM yuplink.mystic_item_template WHERE kind = 'hero' AND active`,
    );
    const fit = heroesOf(all, t.heroRarity);
    const taken = await takenUniqueIds(fit.map((h) => h.id));
    const got = pickOne(fit.filter((h) => !taken.has(h.id)));
    return got ? { ...t, itemTemplateId: got.id, itemName: got.name } : null;
  }
  if (t.kind === "custom" && !t.customId && t.customAny) {
    const got = pickOne(await rows<Named>(`SELECT id, name FROM yuplink.raid_custom_item`));
    return got ? { ...t, customId: got.id, customName: got.name } : null;
  }
  return t;
}
