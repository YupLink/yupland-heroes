// Конь выбранного героя аккаунта (§8.84) — свежим маленьким запросом, а не из кэша
// силы героя: тот живёт 15 с в памяти процесса, и при двух рабочих процессах надетый
// пегас ещё 15 с «не прыгал» бы на соседнем. Здесь — 2 с на процесс: темп шага, порог
// частоты и прыжок пегаса сервер берёт отсюда, клиент — из состояния рейда (move.ts).
// С 03.11.2026 — и зачарование коня (item_enchant.pct): оно множит скорость (§8.84).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { MOUNT_SLOT, mountTier, type MountTier } from "@/lib/hero/mount";

const TTL_MS = 2_000;
export type HeroMount = { tier: MountTier; pct: number };
const cache = new Map<string, { at: number; mount: HeroMount }>();

/** SQL: вид коня на месте «Конь» у выбранного героя аккаунта; нет — пусто. */
export const heroMountSql = (account: string): string =>
  `SELECT t.meta->>'mount' AS mount,
          (SELECT e.pct FROM yuplink.item_enchant e WHERE e.item_id = u.id LIMIT 1) AS pct
     FROM yuplink.hero_instance h
     JOIN yuplink.user_game_item u
       ON u.id = (h.equipped::jsonb ->> ${sqlStr(MOUNT_SLOT)}) AND u.account_id = h.account_id
     JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    WHERE h.account_id = ${sqlStr(account)} AND h.selected_at IS NOT NULL
    ORDER BY h.selected_at DESC
    LIMIT 1;`;

/** Конь выбранного героя и его зачарование; сбой чтения — «без коня» (строже, а не быстрее). */
export async function heroMount(account: string): Promise<HeroMount> {
  const hit = cache.get(account);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.mount;
  const rows = (await mcpExec(heroMountSql(account), { wrapJson: true }).catch(() => [])) as Array<{
    mount?: string | null;
    pct?: number | string | null;
  }> | null;
  const tier = mountTier(rows?.[0]?.mount);
  const mount = { tier, pct: tier === "none" ? 0 : Number(rows?.[0]?.pct) || 0 };
  cache.set(account, { at: Date.now(), mount });
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  return mount;
}

/** Только вид коня (прыжок пегаса, облик). */
export async function heroMountTier(account: string): Promise<MountTier> {
  return (await heroMount(account)).tier;
}

/** Сменили снаряжение — этот процесс узнаёт сразу (соседний — через ≤ 2 с). */
export function dropHeroMount(account?: string): void {
  if (account) cache.delete(account);
  else cache.clear();
}
