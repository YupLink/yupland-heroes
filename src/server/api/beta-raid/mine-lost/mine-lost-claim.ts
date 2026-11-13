// Сбор отнятых шахт и грибов — частью «Собрать со всех шахт» или одной строкой.
// В обоих случаях владельца и повтор проверяет raid_mine_lost_claim в БД.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { bumpAchievement } from "@/server/api/achievements/bump";
import { minelordCredit } from "@/lib/achievements/minelord";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import {
  claimLostSql,
  claimResOf,
  myLostIdsSql,
  type LostClaimRes,
} from "@/server/api/beta-raid/mine-lost/mine-lost-sql";

export type LostClaimed = {
  /** Строки, закрытые этим вызовом. */
  done: string[];
  /** Зачислено: ключ — символ монеты (DARAI) или ресурс, как у сбора шахт. */
  credited: Record<string, number>;
};

/** Ключ суммы — как в ответе claimAllMines: монета — символом, ресурс — сам. */
const keyOf = (r: LostClaimRes): string =>
  r.resource === "token" ? (r.token ?? "token") : (r.resource ?? "?");

/** Одна строка; отказ «не твоя / нет такой» — null. */
async function claimOne(id: string, account: string, wallet: string): Promise<LostClaimRes | null> {
  try {
    return claimResOf(await mcpExec(claimLostSql(id, account, wallet), { wrapJson: true }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/mine_lost_gone/.test(msg)) return null;
    throw e;
  }
}

/** Учитывать только новое начисление; повтор и пустая строка очков не дают. */
function creditResult(out: LostClaimed, id: string, account: string, res: LostClaimRes | null): void {
  if (!res) return;
  out.done.push(id);
  if (res.was || !(res.amount > 0)) return;
  const key = keyOf(res);
  out.credited[key] = Math.round(((out.credited[key] ?? 0) + res.amount) * 10_000) / 10_000;
  const points = minelordCredit({ resource: res.resource, token: res.token }, res.amount);
  bumpAchievement(account, "minelord", points);
}

/** Забрать одну выбранную отнятую шахту или гриб. */
export const claimLostMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
    const out: LostClaimed = { done: [], credited: {} };
    creditResult(out, data.id, account, await claimOne(data.id, account, wallet));
    return { ok: true as const, done: out.done.length > 0, credited: out.credited };
  });

/** Собрать все свои отнятые строки. Сбой одной строки не держит остальные. */
export async function claimLostRows(account: string, wallet: string): Promise<LostClaimed> {
  const rows = ((await mcpExec(myLostIdsSql(account), { wrapJson: true })) ?? []) as Array<{
    id: string;
  }>;
  const out: LostClaimed = { done: [], credited: {} };
  for (const { id } of rows) {
    let res: LostClaimRes | null;
    try {
      res = await claimOne(String(id), account, wallet);
    } catch (e) {
      console.warn("[mine-lost] сбор строки:", id, e instanceof Error ? e.message : e);
      continue;
    }
    creditResult(out, String(id), account, res);
  }
  return out;
}
