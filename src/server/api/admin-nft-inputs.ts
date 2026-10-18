// Админка «Ввод NFT»: ответ на жалобу «ввёл NFT — ничего не пришло».
//
// До этого экрана разбор был только ручным SQL по трём таблицам. Здесь всё
// сразу: поиск по кошельку/токену/транзакции, история операций со статусами,
// что именно выдано и кнопка «догнать сейчас» на конкретный случай.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { STORE_NFT_CONTRACT } from "./chips-mint-helpers";
import { journalReady } from "./nft-input-journal-read";
import { viewBySearch } from "./nft-input-view";
import { recoverStore } from "./nft-input-recover";
import { recoverToken, recoverWallet } from "./nft-input-recover-target";

export const adminNftInputSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ query: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const res = await viewBySearch(data.query);
    return { ...res, journal: await journalReady() };
  });

/**
 * Сироты прямо сейчас — сухой прогон общего скана: считаем и показываем, ничего
 * не выдавая. Это же и есть безопасный способ посмотреть на боевые данные.
 */
export const adminNftInputOrphans = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ maxAgeDays: z.number().int().min(1).max(90).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const maxAgeMs = (data.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000;
    const { summary, rows } = await recoverStore({ dryRun: true, maxAgeMs });
    return {
      summary,
      rows: rows.filter((r) => r.status === "candidate" || r.status === "skipped"),
      journal: await journalReady(),
    };
  });

/** «Догнать сейчас»: один токен либо все переводы одного кошелька. */
export const adminNftInputRecover = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contract: z.string().min(3).optional(),
        tokenId: z.string().min(1).optional(),
        txHash: z.string().min(20).max(64).optional(),
        wallet: z.string().min(2).max(80).optional(),
        dryRun: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    if (data.tokenId) {
      return recoverToken(
        {
          contract: data.contract ?? STORE_NFT_CONTRACT,
          tokenId: data.tokenId,
          txHash: data.txHash,
          wallet: data.wallet,
        },
        { dryRun: data.dryRun },
      );
    }
    if (data.wallet) return recoverWallet(data.wallet, { dryRun: data.dryRun });
    throw new Error("Нужен токен или кошелёк");
  });
