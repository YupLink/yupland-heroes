import { nanoid } from "nanoid";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner } from "../sendler";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import {
  NFT_PRIZE_OWNER,
  SISTER_TTL_MS,
  _sisterCache,
  freeNftCache,
} from "./user-claims-types";

export async function tryReserveNftPrize(opts: {
  contractId: string;
  nftTitle: string;
  userWallet: string;
  campaignId: string | null;
}): Promise<{ tokenId: string; redemptionId: string } | null> {
  const { contractId, nftTitle, userWallet, campaignId } = opts;
  const cacheKey = `${contractId}::${normalizeTitle(nftTitle)}`;

  const owe = async (): Promise<{ tokenId: string; redemptionId: string }> => {
    const redemptionId = `nr_${nanoid(10)}`;
    const placeholder = `owed_${nanoid(12)}`;
    await pg.nftRedemptions.insert({
      id: redemptionId,
      campaign_id: campaignId,
      user_wallet: userWallet,
      contract_id: contractId,
      token_id: placeholder,
      status: "pending",
      claimed_at: new Date().toISOString(),
      nft_title: nftTitle,
    });
    return { tokenId: placeholder, redemptionId };
  };

  const cached = freeNftCache.get(cacheKey);
  let candidates: Array<{ tokenId: string; image: string }>;
  if (cached && Date.now() - cached.at < 30_000) {
    candidates = cached.tokens;
  } else {
    try {
      const items = await fetchSendlerNftsByOwner(contractId, NFT_PRIZE_OWNER);
      const titleNorm = normalizeTitle(nftTitle);
      candidates = items
        .filter((i) => i.title && normalizeTitle(i.title) === titleNorm)
        .map((i) => ({
          tokenId: i.token_id,
          image: i.media ?? "",
        }));
      freeNftCache.set(cacheKey, { at: Date.now(), tokens: candidates });
    } catch (err) {
      console.warn("[reserveNftPrize] Sendler failed:", err);
      return await owe();
    }
  }
  if (candidates.length === 0) return await owe();

  const tokenIds = candidates.map((c) => c.tokenId);
  const { data: reserved } = await pg.nftRedemptions
    .raw()
    .select("token_id")
    .eq("contract_id", contractId)
    .in("token_id", tokenIds);
  const usedSet = new Set(
    ((reserved ?? []) as Array<{ token_id: string }>).map((r) => r.token_id)
  );
  const free = candidates.filter((c) => !usedSet.has(c.tokenId));
  if (free.length === 0) return await owe();

  for (const cand of free) {
    const redemptionId = `nr_${nanoid(10)}`;
    try {
      await pg.nftRedemptions.insert({
        id: redemptionId,
        campaign_id: campaignId,
        user_wallet: userWallet,
        contract_id: contractId,
        token_id: cand.tokenId,
        status: "pending",
        claimed_at: new Date().toISOString(),
        nft_title: nftTitle,
      });
      freeNftCache.delete(cacheKey);
      return { tokenId: cand.tokenId, redemptionId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique/i.test(msg)) {
        continue;
      }
      throw err;
    }
  }
  return await owe();
}

export async function resolveAccountId(
  me: { wallet: string; telegram_id: number | null; account_id?: string | null }
): Promise<string | null> {
  if (me.account_id) return me.account_id;
  const q = (s: string) =>
    mcpExec(s, { wrapJson: true }) as Promise<Array<{ id: string }>>;
  let accId: string;
  if (me.telegram_id != null) {
    const found = await q(
      `SELECT id FROM yuplink.accounts WHERE telegram_id=${me.telegram_id} LIMIT 1;`
    );
    if (found[0]) accId = found[0].id;
    else {
      accId = `acc_${nanoid(20)}`;
      await mcpExec(
        `INSERT INTO yuplink.accounts(id,telegram_id) VALUES('${accId}',${me.telegram_id}) ON CONFLICT (telegram_id) DO NOTHING;`
      );
      const re = await q(
        `SELECT id FROM yuplink.accounts WHERE telegram_id=${me.telegram_id} LIMIT 1;`
      );
      accId = re[0]?.id ?? accId;
    }
  } else {
    accId = `acc_${nanoid(20)}`;
    await mcpExec(`INSERT INTO yuplink.accounts(id) VALUES('${accId}');`);
  }
  const upd = (await mcpExec(
    `UPDATE yuplink.users SET account_id='${accId}' WHERE wallet='${me.wallet.replace(/'/g, "''")}' AND account_id IS NULL RETURNING account_id;`,
    { wrapJsonCte: true }
  )) as Array<{ account_id: string }>;
  let finalAcc = accId;
  if (upd[0]?.account_id) finalAcc = upd[0].account_id;
  else {
    const cur = (await mcpExec(
      `SELECT account_id FROM yuplink.users WHERE wallet='${me.wallet.replace(/'/g, "''")}';`,
      { wrapJson: true }
    )) as Array<{ account_id: string | null }>;
    finalAcc = cur[0]?.account_id ?? accId;
  }
  if (me.telegram_id != null) {
    await mcpExec(
      `UPDATE yuplink.users SET account_id='${finalAcc.replace(/'/g, "''")}' WHERE telegram_id=${me.telegram_id} AND account_id IS NULL;`
    ).catch(() => {});
  }
  return finalAcc;
}

async function computeSisterWallets(wallet: string): Promise<string[]> {
  const me = (await pg.users.findOne({ wallet })) as {
    wallet: string;
    telegram_id: number | null;
    account_id?: string | null;
  } | null;
  if (!me) return [wallet];
  try {
    if (me.account_id) {
      const rows = await pg.users.findMany({ account_id: me.account_id });
      return Array.from(new Set([wallet, ...rows.map((r) => r.wallet)]));
    }
    const accId = await resolveAccountId(me);
    if (accId) {
      const rows = await pg.users.findMany({ account_id: accId });
      return Array.from(new Set([wallet, ...rows.map((r) => r.wallet)]));
    }
  } catch {
    /* mcpExec/resolve флапнул — падаем на telegram_id ниже */
  }
  if (!me.telegram_id) return [wallet];
  const rows = await pg.users.findMany({ telegram_id: me.telegram_id });
  return Array.from(new Set([wallet, ...rows.map((r) => r.wallet)]));
}

export async function getSisterWallets(wallet: string): Promise<string[]> {
  const c = _sisterCache.get(wallet);
  if (c && Date.now() - c.at < SISTER_TTL_MS) return c.value;
  const value = await computeSisterWallets(wallet);
  _sisterCache.set(wallet, { value, at: Date.now() });
  return value;
}
