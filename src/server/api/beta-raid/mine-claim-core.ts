// Сбор добычи с шахт — общее ядро для окна шахты и «Добычи» (mine-claim.ts) и
// для «Управления шахтами» в замке (mine-office-act.ts). Пендинг-модель, без
// крона: владелец забирает целые накопленные часы в любой момент. Повтор не
// задваивает: raid_mine_claim под локом шахты двигает собранные часы и
// начисляет с ключом по новому их уровню. Хозяина проверяет та же функция.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { publishRaid } from "@/server/raidLive";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import { bumpAchievement } from "@/server/api/achievements/bump";
import { minelordCredit } from "@/lib/achievements/minelord";

/** Забрать накопленное одной шахты; чужая — «braid.mine_not_owner». */
export async function claimOne(mapId: string, q: number, r: number, account: string): Promise<number> {
  const map = sqlStr(mapId);
  // cfg — настройка клетки (что за шахта): нужна только ачивке, см. ниже.
  const rows = (await mcpExec(
    `SELECT yuplink.raid_mine_claim(${map}, ${q}, ${r}, ${sqlStr(account)}) AS amt,
            (SELECT c.building_config FROM yuplink.raid_map_cells c
              WHERE c.map_id = ${map} AND c.q = ${q} AND c.r = ${r}) AS cfg;`,
    { wrapJson: true },
  ).catch((e: unknown) => {
    // SQL бросает 'mine_not_owner' сырым текстом (мост дописывает префикс), а
    // humanError переводит только ключи вида domain.key. Случай реальный: окно
    // шахты открыто, а её уже отбили — накопленное ждёт в «Добыче» (§8.71).
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/mine_not_owner/.test(msg) ? "braid.mine_not_owner" : msg);
  })) as Array<{ amt: number; cfg?: unknown }>;
  const amount = Number(rows?.[0]?.amt ?? 0);
  // Ачивка «Хозяин шахт» (§8.57): сколько собрано с шахт; DARAI гриба — очко
  // за каждые 1 000 (владелец 22.10: 10 000 в час 1 к 1 закрывали ачивку).
  bumpAchievement(account, "minelord", minelordCredit(rows?.[0]?.cfg, amount));
  return amount;
}

/** Ключ в итоге сбора: символ монеты у token-шахт, имя товара у custom, иначе ресурс. */
function creditKey(m: MineRow, customNames: Map<string, string>): string {
  if (m.resource === "token") return m.token ?? "token";
  if (m.resource === "custom" && m.token?.startsWith("cst_")) {
    return customNames.get(m.token) ?? "custom";
  }
  return m.resource;
}

/**
 * Собрать с перечисленных своих шахт (любых карт): сколько чего начислено.
 * Чужая или пустая — 0, остальные собираются. Изменённые клетки — рассылкой
 * по своим картам.
 */
export async function claimMineRows(
  account: string,
  mines: readonly MineRow[],
): Promise<Record<string, number>> {
  // Имена кастомных товаров (cst_*) — одним запросом, а не по одной шахте:
  // без них в тосте «0.04 custom» вместо «0.04 Помидор».
  const customIds = mines
    .filter((m) => m.resource === "custom" && m.token?.startsWith("cst_"))
    .map((m) => m.token as string);
  const customNames = new Map<string, string>();
  if (customIds.length > 0) {
    const rows = (await mcpExec(
      `SELECT id, name FROM yuplink.raid_custom_item
        WHERE id IN (${customIds.map((id) => sqlStr(id)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string }>;
    for (const r of rows ?? []) customNames.set(r.id, String(r.name ?? ""));
  }

  const credited: Record<string, number> = {};
  const touched = new Map<string, string[]>();
  for (const m of mines) {
    const amt = await claimOne(m.mapId, m.q, m.r, account).catch(() => 0);
    if (amt <= 0) continue;
    const key = creditKey(m, customNames);
    credited[key] = (credited[key] ?? 0) + amt;
    touched.set(m.mapId, [...(touched.get(m.mapId) ?? []), `${m.q},${m.r}`]);
  }
  for (const [mapId, cells] of touched) publishRaid({ mapId, type: "built", mine: true, cells });
  return credited;
}
