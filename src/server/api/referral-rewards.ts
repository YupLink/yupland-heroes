// Награды за друзей в «Друзьях» (владелец, 22.10.2026): бонус-боксы за вехи и
// 10 % USDT с подписок друзей. Без срока; точка на входе в «Друзья» и в профиле,
// пока есть незабранное. Строки заводят referralTiers.ts (вехи) и покупка
// подписки (energy-sub/buy-sql.ts), забираются здесь — по одной, кнопкой.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { moneyGate } from "../rateGate";
import { requireAccountUser } from "./account-rollout";
import { accAccountId } from "./currency/move";
import { accountIdOf } from "./user-shared";
import {
  claimBoxSql,
  claimUsdtSql,
  firstRow,
  pendingRewardsSql,
  rewardRowSql,
  type RefRewardDb,
  type RefRewardKind,
} from "./referral-rewards-sql";

export type MyRefReward = {
  id: string;
  kind: RefRewardKind;
  /** Бокс: за сколько друзей. */
  milestone: number | null;
  amount: number;
  token: string | null;
  packName: string | null;
  packImage: string | null;
  createdAt: string;
};

export type MyRefRewards = { boxes: MyRefReward[]; usdt: MyRefReward[]; usdtTotal: number };

const EMPTY: MyRefRewards = { boxes: [], usdt: [], usdtTotal: 0 };

/** Догон вех при опросе — не чаще раза в полчаса на аккаунт в процессе. */
const CATCH_UP_MS = 30 * 60_000;
const caughtUpAt = new Map<string, number>();

async function catchUpMilestones(account: string, wallet: string): Promise<void> {
  const now = Date.now();
  if ((caughtUpAt.get(account) ?? 0) + CATCH_UP_MS > now) return;
  caughtUpAt.set(account, now);
  const { grantReferralBoxesIfDue } = await import("../referralTiers");
  await grantReferralBoxesIfDue(wallet);
}

const toReward = (r: RefRewardDb): MyRefReward => ({
  id: r.id,
  kind: r.kind,
  milestone: r.milestone == null ? null : Number(r.milestone),
  amount: Number(r.amount) || 0,
  token: r.token,
  packName: r.pack_name ?? null,
  packImage: r.pack_image ?? null,
  createdAt: r.created_at,
});

/** Мои незабранные награды за друзей. */
export const getMyReferralRewards = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyRefRewards> => {
    const wallet = getCurrentWallet();
    if (!wallet) return EMPTY;
    // Мягкий поиск: опрос точки не должен заводить аккаунты.
    const account = await accountIdOf(wallet).catch(() => null);
    if (!account) return EMPTY;
    await catchUpMilestones(account, wallet);
    // Ошибку чтения не глушим: пустой ответ спрятал бы точку и награды.
    const rows = ((await mcpExec(pendingRewardsSql(account), { wrapJson: true })) ??
      []) as RefRewardDb[];
    const all = rows.map(toReward);
    const usdt = all.filter((r) => r.kind === "usdt");
    return {
      boxes: all.filter((r) => r.kind === "box"),
      usdt,
      usdtTotal: Math.round(usdt.reduce((s, r) => s + r.amount, 0) * 1e6) / 1e6,
    };
  },
);

/** Забрать одну награду. Повтор / вторая вкладка — «уже забрано», без второй выдачи. */
export const claimReferralReward = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = await requireAccountUser();
    await moneyGate("refrw", wallet);
    const account = await accAccountId(wallet);
    if (!account) throw new Error("refrw.no_account");

    const readRow = async () =>
      (
        (await mcpExec(rewardRowSql(account, data.id), { wrapJson: true })) as RefRewardDb[] | null
      )?.[0] ?? null;
    const row = await readRow();
    if (!row) throw new Error("refrw.not_found");
    const amount = Number(row.amount) || 0;
    const done = (already: boolean) => ({
      ok: true as const,
      kind: row.kind,
      amount,
      token: row.token,
      already,
    });
    if (row.status === "claimed") return done(true);

    let claimed = 0;
    if (row.kind === "box") {
      if (!row.pack_id) throw new Error("refrw.not_found");
      // Кончился запас пака — та же подмена, что у бокса подписки (grantPackToUser).
      const { resolveGrantablePack } = await import("./chips-pack-fallback");
      const packId = await resolveGrantablePack(row.pack_id);
      // БЕЗ обёртки wrapJson: изменяющие CTE обязаны стоять на верхнем уровне.
      const r = firstRow<{ claimed: number }>(
        await mcpExec(claimBoxSql({ account, id: row.id, wallet, packId })),
      );
      claimed = Number(r?.claimed) || 0;
    } else {
      const r = firstRow<{ claimed: number }>(
        await mcpExec(claimUsdtSql({ account, id: row.id, wallet })),
      );
      claimed = Number(r?.claimed) || 0;
    }
    if (claimed > 0) return done(false);
    // Строку забрал соседний запрос (вторая вкладка, повтор моста) — это не ошибка.
    if ((await readRow())?.status === "claimed") return done(true);
    throw new Error("refrw.retry");
  });
