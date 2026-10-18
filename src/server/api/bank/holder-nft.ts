// Ввод NFT «Yupik holder (N million darai)» (владелец, 16.10.2026, ПРАВИЛА §8.51) —
// пока только админам: игроки этих NFT во вводе не видят. NFT уходит на склад
// (тот же адрес, что у ввода фишек), N млн DARAI сразу во вклад банка без лока,
// меткой холдера (вывод из игры — через 7 или 30 дней и 5 %).
// Перевод доказывает Sendler (proveNftTransfer), название и владельца — сама цепь.
// Не успел индекс — вклад заведёт обход (catchUpHolderNfts) по ленте склада.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { isAdminWalletLinked, requireAdmin } from "../../auth";
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

/** Завести вклад за NFT, уже лежащую на складе. Повтор — тот же вклад. */
async function stakeOne(wallet: string, tokenId: string): Promise<"staked" | "skip"> {
  const tok = await onchainToken(tokenId);
  const h = holderNft(tok?.title);
  if (!tok || !h || tok.owner !== CHIP_MINT_RECIPIENT) return "skip";
  const acc = await accAccountId(wallet);
  if (!acc) return "skip";
  const pct = STAKE_PLANS[0].pct;
  const { error } = await sb.rpc("bank_stake_holder", {
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
  return "staked";
}

export const listHolderNfts = createServerFn({ method: "GET" }).handler(
  async (): Promise<HolderNftItem[]> => {
    const wallet = requireAdmin();
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
  requireAdmin();
  return { receiverId: CHIP_MINT_RECIPIENT, contract: STORE_NFT_CONTRACT };
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
    const wallet = requireAdmin();
    const { proveNftTransfer } = await import("../nft-input-proof");
    const proof = await proveNftTransfer({
      wallet,
      contract: STORE_NFT_CONTRACT,
      tokenIds: data.tokenIds,
      txHash: data.txHash,
      receiverId: CHIP_MINT_RECIPIENT,
    });
    const staked: string[] = [];
    for (const t of proof.confirmed) if ((await stakeOne(wallet, t)) === "staked") staked.push(t);
    return {
      staked,
      pending: proof.pending,
      rejected: [...proof.rejected.entries()].map(([tokenId, reason]) => ({ tokenId, reason })),
    };
  });

/** Обход: NFT холдеров от админов на складе без вклада (окно закрыли, индекс опоздал). */
export async function catchUpHolderNfts(): Promise<number> {
  const { scanStoreIncoming } = await import("../nft-input-scan");
  // Обход идёт без запроса: админов по Telegram узнаём по привязке в базе.
  const list = [];
  for (const c of await scanStoreIncoming().catch(() => [])) {
    if (c.contract === STORE_NFT_CONTRACT && holderNft(c.title) && (await isAdminWalletLinked(c.wallet)))
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
