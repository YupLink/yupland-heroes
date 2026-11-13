// Надеть комплект: что из снимка реально можно надеть и снятие этих предметов
// с остальных героев. Вынесено из heroes-gear-presets.ts ради лимита в 250 строк.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { heroSlots } from "@/lib/hero/heroSlots";
import { MOUNT_SLOT } from "@/lib/hero/mount";
import { artLocked } from "@/lib/hero/artBroken";

/**
 * Что реально можно надеть: предмет у игрока, место у героя есть, тип совпал.
 * brokenOn — механика поломки запущена (§8.63 п.3): сломанный (износ 100) не
 * надевается, считается в broken — игроку говорят «почини в кузнице».
 */
export async function buildEquipped(
  account: string,
  rarity: string,
  snapshot: Record<string, string>,
  brokenOn = false,
  /** Надетое сейчас: комплект без коня (§8.84) коня не снимает. */
  current: Record<string, string> = {},
): Promise<{ applied: Record<string, string>; missing: number; skipped: number; broken: number }> {
  const ids = [...new Set(Object.values(snapshot))];
  const rows = (await mcpExec(
    ids.length === 0
      ? `SELECT '' AS id, '' AS slot, 0::float8 AS wear WHERE false;`
      : `SELECT u.id, COALESCE(t.slot, '') AS slot, u.wear::float8 AS wear
           FROM yuplink.user_game_item u
           LEFT JOIN yuplink.mystic_item_template t ON t.id = u.template_id
          WHERE u.account_id = ${sqlStr(account)} AND u.id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; slot: string; wear?: unknown }>;
  const slotOf = new Map((rows ?? []).map((r) => [String(r.id), String(r.slot ?? "").trim()]));
  const locked = new Set(
    (rows ?? []).filter((r) => artLocked(r.wear, brokenOn)).map((r) => String(r.id)),
  );

  const defs = heroSlots(rarity);
  const applied: Record<string, string> = {};
  let missing = 0;
  let skipped = 0;
  let broken = 0;
  for (const [key, itemId] of Object.entries(snapshot)) {
    const slot = slotOf.get(itemId);
    if (slot === undefined) {
      missing++;
      continue;
    }
    if (locked.has(itemId)) {
      broken++;
      continue;
    }
    // Место должно быть У ЭТОГО героя и того же типа: комплект легендаря на
    // рарном герое ляжет частично, и это честнее, чем отказ целиком.
    const def = defs.find((d) => d.key === key);
    if (!def || !slot || def.slot !== slot) {
      skipped++;
      continue;
    }
    applied[key] = itemId;
  }
  // Конь (§8.84): комплект без коня — или с конём, которого уже нет, — коня не снимает.
  if (!applied[MOUNT_SLOT] && current[MOUNT_SLOT]) applied[MOUNT_SLOT] = current[MOUNT_SLOT];
  return { applied, missing, skipped, broken };
}

/** Снять эти предметы со всех остальных героев аккаунта. */
export async function unequipFromOthers(
  account: string,
  heroId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  const list = itemIds.map(sqlStr).join(",");
  await mcpExec(
    `UPDATE yuplink.hero_instance h
        SET equipped = COALESCE((
              SELECT jsonb_object_agg(e.key, e.value)
                FROM jsonb_each_text(h.equipped::jsonb) e
               WHERE e.value NOT IN (${list})
            ), '{}'::jsonb),
            updated_at = now()
      WHERE h.account_id = ${sqlStr(account)} AND h.id <> ${sqlStr(heroId)}
        AND jsonb_typeof(h.equipped::jsonb) = 'object'
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(h.equipped::jsonb) x WHERE x.value IN (${list})
        );`,
  );
}
