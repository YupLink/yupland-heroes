// Таймеры ячеек грибов (lib/daraiMine): грибы вида лежат одной стопкой
// dmine:<вид>, и в ячейке — обратный отсчёт до самого раннего «выпадения»
// (час в рюкзаке или конец жизни — что раньше) и число штук. По каждому
// герою аккаунта (25.10: в замке и в таверне смотрят рюкзак любого своего
// героя, отсчёт нужен и там), с пометкой выбранного — его рюкзак у склада,
// сундука, мешочка и «Посадить». Гриб без героя (строка до свёртки) не
// считается. Нет грибов — пустой ответ.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { requireWallet } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { accAccountId } from "@/server/api/currency/move";
import { DMINE_CARRY_MS, dmineDropAt, type DmineTimer } from "@/lib/daraiMine";
import { isMushroomKind, mushroomStackKey } from "@/lib/mushroomKinds";

export type { DmineTimer } from "@/lib/daraiMine";

type TimerRow = {
  takenAt: string | null;
  diesAt: string | null;
  kind?: string | null;
  heroId?: string | null;
  selected?: boolean | null;
};

/** Живые грибы в рюкзаках героев аккаунта: чей, когда легли, когда умрут, выбран ли герой. */
export const dmineTimersSql = (account: string): string =>
  `SELECT d.taken_at AS "takenAt", d.dies_at AS "diesAt", d.mushroom AS kind,
          d.hero_id AS "heroId",
          COALESCE(d.hero_id = (SELECT s.id FROM yuplink.hero_instance s
                                 WHERE s.account_id = ${sqlStr(account)} AND s.selected_at IS NOT NULL
                                 ORDER BY s.selected_at DESC LIMIT 1), false) AS selected
     FROM yuplink.raid_dmine d
     JOIN yuplink.hero_instance h ON h.id = d.hero_id
    WHERE d.state = 'item' AND h.account_id = ${sqlStr(account)}
      AND (d.dies_at IS NULL OR d.dies_at > now() - interval '${Math.round(DMINE_CARRY_MS / 1000)} seconds')`;

/** Строки → ячейка на героя и вид: ближайшее выпадение и сколько штук (битые даты — мимо). */
export function dmineTimersOf(rows: TimerRow[] | null | undefined): DmineTimer[] {
  const out = new Map<string, DmineTimer>();
  for (const row of rows ?? []) {
    const taken = Date.parse(String(row.takenAt ?? ""));
    if (!Number.isFinite(taken)) continue;
    const dies = row.diesAt ? Date.parse(String(row.diesAt)) : NaN;
    const drop = dmineDropAt(taken, Number.isFinite(dies) ? dies : null);
    const stackKey = mushroomStackKey(isMushroomKind(row.kind) ? row.kind : "darai");
    const heroId = typeof row.heroId === "string" && row.heroId ? row.heroId : null;
    const key = `${heroId ?? ""}|${stackKey}`;
    const cur = out.get(key);
    if (!cur)
      out.set(key, { heroId, selected: row.selected === true, stackKey, expiresAt: drop, count: 1 });
    else out.set(key, { ...cur, expiresAt: Math.min(cur.expiresAt, drop), count: cur.count + 1 });
  }
  return [...out.values()];
}

export const getMyDaraiMines = createServerFn({ method: "GET" }).handler(
  async (): Promise<DmineTimer[]> => {
    const wallet = requireWallet();
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) return [];
    const rows = (await mcpExec(dmineTimersSql(account), { wrapJson: true })) as TimerRow[] | null;
    return dmineTimersOf(rows);
  },
);
