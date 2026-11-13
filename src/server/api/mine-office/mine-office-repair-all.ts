// «Управление шахтами»: «Починить всё» — цена, затем починка всех своих шахт
// v2 разом (раскладка — repair-all-plan.ts, запросы — repair-all-sql.ts).
//
//  • Чинятся шахты с запасом ниже порога `below` (ползунок 10–100 %, по
//    умолчанию 90 %, lib/mineV2), шахты острова — нет (в этом окне их не чинят
//    и по одной). Порог починки запоминается на аккаунте (repair-all-pref.ts);
//    цена без порога считается по запомненному.
//  • getMineRepairAllQuote — что починится, что пропущено и почему, общая цена,
//    чего не хватает, и `cells` — ровно их окно присылает в подтверждении.
//  • repairAllMines({ cells }) — чинит. Цену клиент не передаёт: сервер считает
//    её сам. Ключ клетки — аккаунт + клетка + отметка запаса из `cells`, решение
//    принимает база под локом шахты (raid_mine_repair_all): повтор того же
//    подтверждения — хоть одновременный, хоть после потерянного ответа — денег
//    не берёт и отвечает тем же; старое подтверждение после новой починки —
//    клетка в пропущенных (changed). Не хватает ресурсов — отказ целиком.
//
// Ворота — как у починки одной шахты из окна (officeGate: здание, герой в
// замке, частота); у цены — как у списка окна (здание).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { canIgnoreVoid } from "@/server/api/beta-raid/voidGate";
import { fail, requireRepairFunds } from "@/server/api/beta-raid/mine-v2-core";
import { bumpAchievement } from "@/server/api/achievements/bump";
import { sqlStr } from "@/server/api/raid-shared";
import { mineRepairAllBelow } from "@/lib/mineV2";
import { officeCellsSql } from "./mine-office-list";
import { savedRepairBelow, saveRepairBelow } from "./repair-all-pref";
import { officeGate, officeWho, requireMineOffice } from "./mine-office-own";
import {
  addCost,
  cellKey,
  planRepairAll,
  repairAllOp,
  shortOf,
  type RepairAllCell,
  type RepairCost,
  type RepairPlan,
  type RepairPlanItem,
  type RepairSkip,
  type RepairStateRow,
} from "./repair-all-plan";
import { repairAllSql, stateSql } from "./repair-all-sql";

/** Больше шахт у одного аккаунта не бывает (на проде максимум — 100). */
const MAX_CELLS = 300;

type Skipped = RepairPlan["skipped"];

export type RepairAllQuote = {
  /** Что починится: вид, режим (остров — «База»), запас сейчас, цена клетки. */
  mines: Array<Omit<RepairPlanItem, "op">>;
  skipped: Skipped;
  /** Общая цена; пусто — чинить нечего. */
  total: RepairCost;
  /** Чего не хватает; пусто — хватает. */
  short: RepairCost;
  /** Прислать как есть в repairAllMines. */
  cells: RepairAllCell[];
  /** Порог, по которому посчитана цена (доля 0..1) — прислать вместе с cells. */
  below: number;
  serverNow: number;
};

export type RepairAllResult = {
  ok: true;
  /** Починено этим подтверждением (и при его повторе). */
  repaired: Array<{ mapId: string; q: number; r: number }>;
  skipped: Skipped;
  /** Списано за это подтверждение (повтор отвечает той же суммой, второй раз не списывая). */
  charged: RepairCost;
};

async function balances(account: string): Promise<Map<string, number>> {
  const rows = (await mcpExec(
    `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ resource: string; amount: number | string }> | null;
  return new Map((rows ?? []).map((x) => [x.resource, Number(x.amount) || 0]));
}

const stripOp = ({ op: _op, ...rest }: RepairPlanItem): Omit<RepairPlanItem, "op"> => rest;

export const getMineRepairAllQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    // Порог не прислан — окно только открыли: берём выбранный в прошлый раз.
    const raw = (d as { below?: unknown } | undefined)?.below;
    return { below: raw === undefined ? null : mineRepairAllBelow(raw) };
  })
  .handler(async ({ data: input }): Promise<RepairAllQuote> => {
    const { wallet, account } = await officeWho();
    await requireMineOffice(account);
    const below = input.below ?? (await savedRepairBelow(account));
    const own = ((await mcpExec(officeCellsSql(account), { wrapJson: true })) ?? []) as Array<{
      map_id: string;
      q: number | string;
      r: number | string;
    }>;
    const cells = own.map((c) => ({ mapId: c.map_id, q: Number(c.q), r: Number(c.r), op: null }));
    const rows = cells.length
      ? (((await mcpExec(stateSql(cells), { wrapJson: true })) ?? []) as RepairStateRow[])
      : [];
    const now = Date.now();
    const plan = planRepairAll({
      rows,
      account,
      seesVoid: canIgnoreVoid(wallet),
      now,
      below,
    });
    const short = plan.repair.length ? shortOf(plan.total, await balances(account)) : {};
    return {
      mines: plan.repair.map(stripOp),
      skipped: plan.skipped,
      total: plan.total,
      short,
      cells: plan.repair.map(({ mapId, q, r, lifeAt }) => ({ mapId, q, r, lifeAt })),
      below,
      serverNow: now,
    };
  });

const inputSchema = z.object({
  cells: z
    .array(
      z.object({
        mapId: z.string().min(1).max(128),
        q: z.number().int().min(-100_000).max(100_000),
        r: z.number().int().min(-100_000).max(100_000),
        lifeAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(1)
    .max(MAX_CELLS),
  below: z.number().optional(),
});

/** Строка функции базы raid_mine_repair_all. */
type ExecRow = {
  map_id: string;
  q: number | string;
  r: number | string;
  status: "repaired" | "again" | RepairSkip;
  captured: boolean | null;
  credited: number | string | null;
  credited_to: string | null;
  cost: unknown;
};

const SKIPS: readonly string[] = [
  "full",
  "broken",
  "island",
  "spent",
  "void",
  "not_owner",
  "changed",
];

/** Цена из ответа базы — только известные ресурсы и числа. */
function costOf(raw: unknown): RepairCost {
  const out: RepairCost = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k as keyof RepairCost] = n;
  }
  return addCost({}, out);
}

export const repairAllMines = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<RepairAllResult> => {
    const { wallet, account } = await officeGate("mine-repair-all");
    // Порог этого подтверждения — запомнить к следующему разу (с телефона на ПК).
    if (data.below !== undefined) void saveRepairBelow(account, data.below);
    const uniq = [...new Map(data.cells.map((c) => [cellKey(c.mapId, c.q, c.r), c])).values()];
    const seen = new Map(uniq.map((c) => [cellKey(c.mapId, c.q, c.r), c.lifeAt]));
    const opOf = (c: { mapId: string; q: number; r: number }) =>
      repairAllOp(account, c, seen.get(cellKey(c.mapId, c.q, c.r)) ?? 0);
    const rows = ((await mcpExec(stateSql(uniq.map((c) => ({ ...c, op: opOf(c) }))), {
      wrapJson: true,
    })) ?? []) as RepairStateRow[];
    const plan = planRepairAll({
      rows,
      account,
      seesVoid: canIgnoreVoid(wallet),
      now: Date.now(),
      seen,
      below: mineRepairAllBelow(data.below),
    });
    const items = [...plan.again, ...plan.repair].map((it) => ({
      ...it,
      seen: seen.get(cellKey(it.mapId, it.q, it.r)) ?? 0,
      op: opOf(it),
    }));
    if (!items.length)
      return { ok: true as const, repaired: [], skipped: plan.skipped, charged: {} };
    // Повтор того же подтверждения денег не требует — проверяем только новое.
    if (plan.repair.length) await requireRepairFunds(account, plan.total);

    const out = ((await mcpExec(repairAllSql({ account, wallet, items }), {
      wrapJson: true,
    }).catch(fail)) ?? []) as ExecRow[];

    let charged: RepairCost = {};
    const repaired: RepairAllResult["repaired"] = [];
    const skipped: Skipped = [...plan.skipped];
    const byMap = new Map<string, { cells: string[]; owner: boolean }>();
    for (const x of out) {
      const cell = { mapId: String(x.map_id), q: Number(x.q), r: Number(x.r) };
      if (x.status !== "repaired" && x.status !== "again") {
        skipped.push({ ...cell, reason: SKIPS.includes(x.status) ? x.status : "changed" });
        continue;
      }
      if (x.status === "repaired")
        bumpAchievement(x.credited_to, "minelord", Number(x.credited ?? 0));
      repaired.push(cell);
      charged = addCost(charged, costOf(x.cost));
      const m = byMap.get(cell.mapId) ?? { cells: [], owner: false };
      m.cells.push(`${cell.q},${cell.r}`);
      m.owner ||= x.captured === true;
      byMap.set(cell.mapId, m);
    }
    // И при повторе: первый ответ мог потеряться вместе с рассылкой.
    for (const [mapId, m] of byMap) {
      publishRaid({ mapId, type: "built", mine: true, owner: m.owner, cells: m.cells });
    }
    return { ok: true as const, repaired, skipped, charged };
  });

export type { RepairSkip };
