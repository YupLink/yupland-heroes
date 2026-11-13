// Дроп босса острова (§8.47, владелец 20.10.2026): лайки, тренировочный пак,
// случайный обычный артефакт, золото — бросок на сервере, раз на жизнь босса
// (payoutByTop зовёт после claimObjectPayout). Числа — lib/raid/island/drops.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { secureRandomInt } from "@/lib/secureRandom";
import { ISLAND_ART_CAP, islandBossDrops } from "@/lib/raid/island/drops";
import { ISLAND_ITEMS, ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";
import { stepOf } from "@/lib/achievements/tracks";

/** Строка выдачи в «Добычу»: вид, сколько, ссылка (пак, шаблон, ресурс). */
export type IslandGive = { kind: string; amount: number; ref: string | null };

/**
 * Кто уже взял «Охотника: Обычная». Читать ДО bumpBossKill: счётчик этого
 * босса пишется без ожидания, и 30-е убийство иначе считалось бы как попало.
 */
export async function islandHunters(accounts: readonly string[]): Promise<Set<string>> {
  if (accounts.length === 0) return new Set();
  const rows = (await mcpExec(
    `SELECT account_id, count FROM yuplink.account_achievement
      WHERE track = 'hunter' AND account_id IN (${accounts.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ account_id: string; count: number | string }>;
  return new Set(
    (rows ?? [])
      .filter((r) => stepOf("hunter", Number(r.count) || 0) >= 1)
      .map((r) => r.account_id),
  );
}

/** У кого уже ISLAND_ART_CAP артефактов (лежат у аккаунта + ждут в «Добыче» острова). */
export const artFullSql = (accounts: readonly string[]): string =>
  `SELECT a.account_id FROM (VALUES ${accounts.map((x) => `(${sqlStr(x)})`).join(", ")}) AS a(account_id)
    WHERE (SELECT count(*) FROM yuplink.user_game_item u
            WHERE u.account_id = a.account_id AND u.kind = 'artifact')
        + (SELECT count(*) FROM yuplink.raid_reward w
            WHERE w.account_id = a.account_id AND w.reward_kind = 'item' AND w.claimed_at IS NULL
              AND left(w.location_id, 5) = 'isle_') >= ${ISLAND_ART_CAP}`;

export async function islandArtFull(accounts: readonly string[]): Promise<Set<string>> {
  if (accounts.length === 0) return new Set();
  const rows = (await mcpExec(artFullSql(accounts), { wrapJson: true }).catch(() => [])) as Array<{
    account_id: string;
  }> | null;
  return new Set((rows ?? []).map((r) => r.account_id));
}

/**
 * Сверх броска (islandDropsFor) босс острова даёт только руду своей клетки (владелец,
 * 13.11.2026: «обновляй все награды боссов на острове обучения в канон оговоренных»):
 * мировые награды шаблона — лайки и токены мест, паки, артефакты, ресурсы — не выдаются.
 */
export function islandCanonExtras<T extends { kind: string; ref?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.kind === "custom" && r.ref === ISLAND_ITEMS.ore);
}

/** Что выпало одному бившему. Каталог артефактов пуст или потолок — артефакт пропускаем. */
export async function islandDropsFor(
  hunterCommon: boolean,
  artFull = false,
): Promise<IslandGive[]> {
  const d = islandBossDrops(hunterCommon, (n) => secureRandomInt(0, n));
  const out: IslandGive[] = [{ kind: "likes", amount: d.likes, ref: null }];
  if (d.pack) out.push({ kind: "pack", amount: 1, ref: ISLAND_TRAINING_PACK });
  if (d.artifact && !artFull) {
    try {
      const { pickArtTemplateByRarity } = await import("../art-rarity");
      out.push({ kind: "item", amount: 1, ref: (await pickArtTemplateByRarity("common")).id });
    } catch (e) {
      console.warn("[island-drops] артефакт:", e instanceof Error ? e.message : e);
    }
  }
  if (d.gold > 0) out.push({ kind: "resource", amount: d.gold, ref: "gold" });
  return out;
}
