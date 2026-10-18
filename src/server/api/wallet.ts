// Admin server-fn'ы для ПРОСМОТРА embedded-кошельков юзеров.
// Custodial endpoints (create/import/sign/export-seed/export-key за юзера)
// УДАЛЕНЫ — теперь это non-custodial: ключи живут только в TG CloudStorage юзера.
// Подписать за юзера никто не может.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { pg } from "../db/pg";
import { pinImageToIpfs } from "../ipfs";

export const adminListWallets = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows = await pg.userWallets.findMany(undefined, {
      orderBy: { column: "created_at", ascending: false },
    });
    return rows.map((r) => ({
      account_id: r.account_id,
      linked_user: r.linked_user,
      public_key: r.public_key,
      is_active: r.is_active,
      label: r.label,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
    }));
  }
);

export const adminWalletAudit = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().min(2).optional(),
        limit: z.number().int().positive().max(500).default(100),
      })
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const filter = data.accountId ? { account_id: data.accountId } : undefined;
    const rows = await pg.walletAudit.findMany(filter, {
      orderBy: { column: "created_at", ascending: false },
      limit: data.limit,
    });
    return rows;
  });

// ──────── Балансы / NFT через NEAR RPC + indexer ────────

const FASTNEAR_API = "https://api.fastnear.com";

export interface FtBalance {
  contract_id: string;
  balance: string;
  symbol?: string;
  decimals?: number;
}

export const adminWalletBalances = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    let nearBalance = "0";
    try {
      const { nearRpc } = await import("../rpc");
      const j = await nearRpc<{ amount?: string }>("query", {
        request_type: "view_account",
        finality: "final",
        account_id: data.accountId,
      });
      nearBalance = j.result?.amount ?? "0";
    } catch {
      // ignore
    }

    let fts: FtBalance[] = [];
    try {
      const r = await fetch(
        `${FASTNEAR_API}/v1/account/${encodeURIComponent(data.accountId)}/ft`
      );
      if (r.ok) {
        const j = (await r.json()) as {
          tokens?: Array<{ contract_id: string; balance: string }>;
        };
        fts = (j.tokens ?? []).map((t) => ({
          contract_id: t.contract_id,
          balance: t.balance,
        }));
      }
    } catch {
      // ignore
    }

    const tokens = await pg.rewardTokens.findMany();
    const tokenMap = new Map(tokens.map((t) => [t.ft_contract, t]));
    fts = fts.map((f) => {
      const meta = tokenMap.get(f.contract_id);
      return {
        ...f,
        symbol: meta?.symbol,
        decimals: meta?.decimals,
      };
    });

    return { nearBalance, fts };
  });

export const adminWalletNfts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ accountId: z.string().min(2) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const rows = await pg.nfts.findMany({ owner_wallet: data.accountId });
    return rows.map((r) => ({
      contract_id: r.contract_id,
      token_id: r.token_id,
      title: r.name,
      media: r.image,
      collection: r.collection,
    }));
  });

// Поиск NFT по ТАЙТЛУ через SENDLER (живой источник истины, не кэш pg.nfts) —
// для батч-раздачи по CSV. fetchSendlerNftsByTitle тянет все экземпляры тайтла
// (с обработкой trailing-space квирков Mintbase) вместе с owner_id. Возвращаем:
//   • tokenIds/count — что лежит на выбранном кошельке-отправителе (для отправки);
//   • holders — разбивка по владельцам (чтобы сразу видеть, на каком кошельке
//     лежат эти NFT, даже до выбора отправителя);
//   • totalForTitle — сколько всего этого тайтла в контракте.
// Сравнение тайтла нормализованное (схлоп пробелов + trim + lower).
const NFT_MAIN_CONTRACT = "yuplandshop.mintbase1.near";

export interface NftTitleResolution {
  contractId: string;
  image: string | null;
  tokenIds: string[];
  count: number;
  totalForTitle: number;
  holders: Array<{ wallet: string; count: number }>;
}

// Один тайтл → что лежит на owner + разбивка по держателям (живой Sendler).
async function resolveNftTitle(
  contract: string,
  title: string,
  owner: string
): Promise<NftTitleResolution> {
  const { fetchSendlerNftsByTitle } = await import("../sendler");
  const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const want = norm(title);

  const items = await fetchSendlerNftsByTitle(contract, title);
  const ofTitle = items.filter((it) => norm(it.title ?? "") === want);
  const mine = owner ? ofTitle.filter((it) => it.owner_id === owner) : [];

  const byOwner = new Map<string, number>();
  for (const it of ofTitle) {
    const ow = it.owner_id ?? "";
    if (!ow) continue;
    byOwner.set(ow, (byOwner.get(ow) ?? 0) + 1);
  }
  const holders = [...byOwner.entries()]
    .map(([wallet, count]) => ({ wallet, count }))
    .sort((a, b) => b.count - a.count);

  return {
    contractId: contract,
    image: mine[0]?.media ?? ofTitle[0]?.media ?? null,
    tokenIds: mine.map((it) => it.token_id),
    count: mine.length,
    totalForTitle: ofTitle.length,
    holders,
  };
}

export const adminFindNftsByTitle = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerWallet: z.string().max(64).optional(),
        title: z.string().min(1).max(200),
        contract: z.string().min(2).max(64).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    return resolveNftTitle(
      data.contract ?? NFT_MAIN_CONTRACT,
      data.title,
      (data.ownerWallet ?? "").trim()
    );
  });

// Несколько тайтлов за раз — для раздачи по нескольким CSV. Возвращает
// объект { [title]: NftTitleResolution }. Тайтлы обрабатываем последовательно
// (Sendler-rate-limit), каждый кэшируется внутри fetchSendlerNftsByTitle.
export const adminFindNftsByTitles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerWallet: z.string().max(64).optional(),
        titles: z.array(z.string().min(1).max(200)).min(1).max(50),
        contract: z.string().min(2).max(64).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const contract = data.contract ?? NFT_MAIN_CONTRACT;
    const owner = (data.ownerWallet ?? "").trim();
    const out: Record<string, NftTitleResolution> = {};
    const uniqueTitles = [...new Set(data.titles)];
    for (const title of uniqueTitles) {
      out[title] = await resolveNftTitle(contract, title, owner);
    }
    return out;
  });

// Билдер nft_batch_mint actions для ДОМИНТА недостающих NFT — метаданные
// (title/media/description) копируются из существующего экземпляра тайтла в
// Sendler. Формула «лавки» (как adminBuildNftMintActions): deposit 0.00987 NEAR
// × num × 1.05; gas = clamp(50+2·num, 100..280) TGas; чистка контрол-символов;
// кириллица в description убирается (ломает кошелёк). Минтит ПРЯМО получателям
// (owner_id = кошелёк получателя), royalty идёт минтеру (signerWallet).
// Подписывает клиент кошельком-отправителем (должен быть минтером контракта).
const NFT_MINT_DEPOSIT_PER = 9870000000000000000000n; // 0.00987 NEAR / токен

export const adminBuildNftMintActions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        contract: z.string().min(2).max(64).optional(),
        signerWallet: z.string().min(2).max(64),
        mints: z
          .array(
            z.object({
              wallet: z.string().min(2).max(64),
              count: z.number().int().min(1).max(125),
            })
          )
          .min(1)
          .max(200),
        royaltyPercent: z.number().int().min(0).max(5000).default(500),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const { fetchSendlerNftsByTitle } = await import("../sendler");
    const contract = data.contract ?? NFT_MAIN_CONTRACT;
    const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const want = norm(data.title);

    const items = await fetchSendlerNftsByTitle(contract, data.title);
    const sample = items.find((it) => norm(it.title ?? "") === want);
    if (!sample)
      throw new Error(
        `Нет образца «${data.title}» в Sendler — неоткуда взять метаданные для минта`
      );

    const cleanStr = (s: string | null | undefined): string =>
      (s ?? "")
        .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const descRaw = cleanStr(sample.description);
    // кириллица в description ломает кошелёк (см. chips mint) → убираем
    const description = /[Ѐ-ӿ]/.test(descRaw) ? "" : descRaw;
    const rep = (sample as { reputation?: number }).reputation;
    const media = cleanStr(await pinImageToIpfs(sample.media ?? ""));
    const metadata: {
      title: string;
      description: string;
      media: string;
      extra?: string;
    } = {
      title: cleanStr(sample.title),
      description,
      media,
    };
    if (typeof rep === "number")
      metadata.extra = JSON.stringify({ Reputation: rep });

    const actions = data.mints.map((m) => {
      const num = m.count;
      const deposit = (
        (NFT_MINT_DEPOSIT_PER * BigInt(num) * 105n) /
        100n
      ).toString();
      const gasTgas = Math.min(280, Math.max(100, 50 + 2 * num));
      const royalty_args =
        data.royaltyPercent > 0
          ? {
              split_between: { [data.signerWallet]: 10000 } as Record<
                string,
                number
              >,
              percentage: data.royaltyPercent,
            }
          : undefined;
      return {
        recipient: m.wallet,
        count: num,
        methodName: "nft_batch_mint" as const,
        args: {
          owner_id: m.wallet,
          metadata,
          num_to_mint: num,
          split_owners: null as null,
          ...(royalty_args ? { royalty_args } : {}),
        },
        gas: (BigInt(gasTgas) * 1_000_000_000_000n).toString(),
        deposit,
      };
    });

    return { contract, mediaSample: media, actions };
  });
