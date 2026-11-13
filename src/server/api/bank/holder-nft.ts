// Ввод NFT «Yupik holder (N million darai)» (владелец, 16.10.2026, ПРАВИЛА §8.51) —
// открыт игрокам 20.10.2026 («включай»). NFT уходит на склад (тот же адрес, что у
// ввода фишек), N млн DARAI сразу во вклад банка без лока, меткой холдера (вывод
// из игры — через 7 или 30 дней и 5 %).
// Перевод доказывает Sendler (proveNftTransfer: прислал именно этот кошелёк, на наш
// склад, в этой транзакции), название и владельца — сама цепь. Не NFT холдера —
// отказ; одна NFT — один вклад навсегда: повтор отдаёт тот же вклад, а NFT, по
// которой вклад уже есть у другого аккаунта, — отказ.
// Не успел индекс — вклад заведёт обход (catchUpHolderNfts) по ленте склада.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { isAdminWallet, isAdminWalletLinked, requireWallet } from "../../auth";
import { bankBuiltFor } from "./bank-access";
import { moneyGate } from "../../rateGate";
import { sqlStr } from "../raid-shared";
import { accAccountId } from "../currency/move";
import { STORE_NFT_CONTRACT, CHIP_MINT_RECIPIENT } from "../chips-mint-helpers";
import { STAKE_PLANS, goldPerDay, holderNft } from "@/lib/bankStake";

export type HolderNftItem = {
  tokenId: string;
  title: string;
  darai: number;
  unlockDays: 7 | 30;
  media: string | null;
};

/** Токены, уже ставшие вкладами (одна NFT — один вклад навсегда). */
async function stakedTokens(tokenIds: string[]): Promise<Set<string>> {
  if (tokenIds.length === 0) return new Set();
  const rows = (await mcpExec(
    `SELECT nft_token FROM yuplink.bank_stake
      WHERE nft_contract = '${STORE_NFT_CONTRACT}' AND nft_token IN (${tokenIds.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ nft_token: string }>;
  return new Set((rows ?? []).map((r) => r.nft_token));
}

/** Владелец и название токена — из цепи, не со слов браузера. */
async function onchainToken(tokenId: string): Promise<{ owner: string; title: string } | null> {
  const { nearRpc } = await import("../../rpc");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: STORE_NFT_CONTRACT,
    method_name: "nft_token",
    args_base64: Buffer.from(JSON.stringify({ token_id: tokenId })).toString("base64"),
  });
  const bytes = r.result?.result;
  if (r.error || !bytes) return null;
  const j = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
    owner_id?: string;
    metadata?: { title?: string };
  } | null;
  return j?.owner_id ? { owner: j.owner_id, title: (j.metadata?.title ?? "").trim() } : null;
}

/** Обход для игроков (не админов) — только переводы с открытия ввода: раньше
 *  игрок этого раздела не видел, и старый перевод на склад — не ввод. */
export const HOLDER_INPUT_OPEN_MS = Date.parse("2026-10-20T00:00:00Z");

/** Почему NFT не стала вкладом: pending — цепь ещё не показала её на складе. */
export type StakeOutcome = "staked" | "pending" | "not_holder" | "no_account" | "taken";
export const HOLDER_REJECT: Record<"not_holder" | "no_account" | "taken", string> = {
  not_holder: "это не NFT холдера",
  no_account: "не найден счёт аккаунта",
  taken: "по этой NFT вклад уже заведён",
};

/** Завести вклад за NFT, уже лежащую на складе. Повтор — тот же вклад. */
async function stakeOne(wallet: string, tokenId: string): Promise<StakeOutcome> {
  const tok = await onchainToken(tokenId);
  if (!tok) return "pending";
  const h = holderNft(tok.title);
  if (!h) return "not_holder";
  if (tok.owner !== CHIP_MINT_RECIPIENT) return "pending";
  const acc = await accAccountId(wallet);
  if (!acc) return "no_account";
  const pct = STAKE_PLANS[0].pct;
  const { error, data } = await sb.rpc("bank_stake_holder", {
    p_account: acc,
    p_contract: STORE_NFT_CONTRACT,
    p_token: tokenId,
    p_title: tok.title,
    p_amount: h.darai,
    p_unlock_days: h.unlockDays,
    p_pct: pct,
    p_gold_day: goldPerDay(h.darai, pct),
    p_op: `hold:${STORE_NFT_CONTRACT}:${tokenId}`,
  });
  if (error) throw new Error(String(error.message ?? "Не удалось завести вклад"));
  const r = (data as Array<{ stake_id: string; applied: boolean }> | null)?.[0];
  if (r?.applied !== false) return "staked";
  // Вклад по этой NFT уже был: свой — повтор, чужой — NFT уже введена другим.
  const own = (await mcpExec(
    `SELECT account_id FROM yuplink.bank_stake WHERE id = ${sqlStr(String(r.stake_id))};`,
    { wrapJson: true },
  )) as Array<{ account_id: string }>;
  return own?.[0]?.account_id === acc ? "staked" : "taken";
}

export const listHolderNfts = createServerFn({ method: "GET" }).handler(
  async (): Promise<HolderNftItem[]> => {
    const wallet = requireWallet();
    const { fetchSendlerNftsByOwner } = await import("../../sendler");
    const nfts = await fetchSendlerNftsByOwner(STORE_NFT_CONTRACT, wallet).catch(() => []);
    const items = nfts
      .map((n) => ({ n, h: holderNft(n.title) }))
      .filter(
        (x): x is { n: (typeof nfts)[number]; h: NonNullable<ReturnType<typeof holderNft>> } =>
          !!x.h && !!x.n.token_id,
      );
    const done = await stakedTokens(items.map((x) => String(x.n.token_id)));
    return items
      .filter((x) => !done.has(String(x.n.token_id)))
      .map(({ n, h }) => ({
        tokenId: String(n.token_id),
        title: (n.title ?? "").trim(),
        darai: h.darai,
        unlockDays: h.unlockDays,
        media: n.media ?? null,
      }))
      .sort((a, b) => b.darai - a.darai);
  },
);

export const getHolderInputInfo = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  // Вклад виден и снимается в окне банка: без построенного банка NFT вводить
  // некуда — окно ввода просит сначала построить банк (§8.61).
  const { accAccountId } = await import("../currency/move");
  const acc = await accAccountId(wallet);
  const bankBuilt = isAdminWallet(wallet) || (acc ? await bankBuiltFor(acc) : false);
  return { receiverId: CHIP_MINT_RECIPIENT, contract: STORE_NFT_CONTRACT, bankBuilt };
});

export const stakeHolderNfts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tokenIds: z.array(z.string().min(1).max(40)).min(1).max(10),
        txHash: z.string().min(20).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("holder-nft-stake", wallet);
    const { proveNftTransfer } = await import("../nft-input-proof");
    const proof = await proveNftTransfer({
      wallet,
      contract: STORE_NFT_CONTRACT,
      tokenIds: data.tokenIds,
      txHash: data.txHash,
      receiverId: CHIP_MINT_RECIPIENT,
    });
    const staked: string[] = [];
    const pending = [...proof.pending];
    const rejected = [...proof.rejected.entries()].map(([tokenId, reason]) => ({
      tokenId,
      reason,
    }));
    for (const t of proof.confirmed) {
      const r = await stakeOne(wallet, t);
      if (r === "staked") staked.push(t);
      else if (r === "pending") pending.push(t);
      else rejected.push({ tokenId: t, reason: HOLDER_REJECT[r] });
    }
    return { staked, pending, rejected };
  });

/** Обход: NFT холдеров на складе без вклада (окно закрыли, индекс опоздал) — вклад
 *  отправителю. Игрокам — переводы с открытия ввода; админам — как раньше, любые. */
export async function catchUpHolderNfts(): Promise<number> {
  const { scanStoreIncoming } = await import("../nft-input-scan");
  const list = [];
  for (const c of await scanStoreIncoming().catch(() => [])) {
    if (c.contract !== STORE_NFT_CONTRACT || !holderNft(c.title)) continue;
    // Админов по Telegram узнаём по привязке в базе (обход идёт без запроса).
    if ((c.atMs ?? Date.now()) >= HOLDER_INPUT_OPEN_MS || (await isAdminWalletLinked(c.wallet)))
      list.push(c);
  }
  const done = await stakedTokens(list.map((c) => c.tokenId));
  let n = 0;
  for (const c of list) {
    if (done.has(c.tokenId)) continue;
    if ((await stakeOne(c.wallet, c.tokenId).catch(() => "skip" as const)) === "staked") n++;
  }
  return n;
}
