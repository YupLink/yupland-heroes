// YUPLINK · Админ · универсальный минт NFT (как @nft_sender_yupland_bot).
// Форма: контракт, owner, тайтл, описание, картинка, кол-во (1–120), роялти,
// репутация. Строим nft_batch_mint actions; клиент подписывает СВОИМ
// кошельком (getConnector).
//
// Картинка пиннится в IPFS (Pinata) ОДИН раз (кэш в settings) и одинаковый
// media уходит во все action'ы батча — «загружается 1 раз, используется одно
// и то же».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { pinImageToIpfs } from "../ipfs";

const DEFAULT_CONTRACT = "yuplandshop.mintbase1.near";
const DEFAULT_OWNER = "darai_collection.near";

// Точные параметры лавки/сендера:
//   deposit = 0.00987 NEAR × num × 1.05
//   gas     = 100 TGas/action — ЖЁСТКО: другие значения валят HOT-кошелёк
//             «Bad control character».
//   TX-бюджет 300 TGas → клиент пакует до 3 action'ов в 1 TX.
const MINT_DEPOSIT_PER = 9870000000000000000000n; // yocto, 0.00987 NEAR
const MINT_GAS_PER_ACTION = "100000000000000"; // 100 TGas
const TX_GAS_BUDGET = 300_000_000_000_000;
// Чтобы 100 TGas хватало on-chain, дробим кол-во на чанки ≤40 в отдельные
// nft_batch_mint. Клиент упакует по 3 (=300 TGas) в 1 TX: 120 → [40,40,40] →
// 1 подпись.
const MAX_PER_ACTION = 40;

export type NftMintAction = {
  num: number;
  action: {
    type: "FunctionCall";
    params: {
      methodName: "nft_batch_mint";
      args: Record<string, unknown>;
      gas: string;
      deposit: string;
    };
  };
};
export type NftMintBuild = {
  contract: string;
  recipient: string;
  media: string;
  total: number;
  txGasBudget: number;
  actions: NftMintAction[];
};

// HOT-кошелёк валится на неэкранированных контрол-байтах в string-литералах
// metadata. Чистим по code-point (без raw-байтов в исходнике): C0/DEL,
// zero-width (U+200B..U+200F), LS/PS (U+2028/2029), BOM (U+FEFF).
function cleanStr(s: string | null | undefined): string {
  let out = "";
  for (const ch of s ?? "") {
    const o = ch.codePointAt(0) ?? 0;
    const bad =
      o <= 0x1f ||
      o === 0x7f ||
      (o >= 0x200b && o <= 0x200f) ||
      o === 0x2028 ||
      o === 0x2029 ||
      o === 0xfeff;
    out += bad ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export const adminBuildNftMintActions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contractId: z.string().min(1).default(DEFAULT_CONTRACT),
        ownerId: z.string().min(1).default(DEFAULT_OWNER),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).default(""),
        mediaUrl: z.string().min(1),
        numToMint: z.number().int().min(1).max(120),
        // basis points (500 = 5%). UI шлёт percent × 100.
        royaltyPercent: z.number().int().min(0).max(5000).default(500),
        reputation: z
          .number()
          .int()
          .min(0)
          .max(1_000_000)
          .nullable()
          .default(null),
        signerAccount: z.string().min(1),
      })
      .parse(d)
  )
  .handler(async ({ data }): Promise<NftMintBuild> => {
    requireAdmin();

    // Пиннинг картинки в IPFS ОДИН раз → gateway-URL (кэш в settings).
    const media = cleanStr(await pinImageToIpfs(data.mediaUrl));
    if (!media) {
      throw new Error("Не удалось запиннить изображение (media пустой)");
    }

    // Одинаковые метаданные на весь батч (media переиспользуется).
    const metadata = {
      title: cleanStr(data.title),
      description: cleanStr(data.description),
      media,
      extra: JSON.stringify({ Reputation: Number(data.reputation ?? 0) }),
    };

    const actions: NftMintAction[] = [];

    let left = data.numToMint;
    while (left > 0) {
      const num = Math.min(left, MAX_PER_ACTION);
      left -= num;
      const deposit = (
        (MINT_DEPOSIT_PER * BigInt(num) * 105n) /
        100n
      ).toString();
      actions.push({
        num,
        action: {
          type: "FunctionCall",
          params: {
            methodName: "nft_batch_mint",
            args: {
              owner_id: data.ownerId,
              metadata,
              num_to_mint: num,
              royalty_args: {
                // Роялти целиком на owner (как у сендера: split_between owner).
                split_between: { [data.ownerId]: 10000 },
                percentage: data.royaltyPercent,
              },
              split_owners: null,
            },
            gas: MINT_GAS_PER_ACTION,
            deposit,
          },
        },
      });
    }

    return {
      contract: data.contractId,
      recipient: data.ownerId,
      media,
      total: data.numToMint,
      txGasBudget: TX_GAS_BUDGET,
      actions,
    };
  });
