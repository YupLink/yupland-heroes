// YUPLINK · Диагностика NFT-выплат: последние строки nft_redemptions с
// last_error и сброс флага после ручного фикса. Вынесено из payouts.ts —
// это про разбор завалов, а не про раздачу DARAI.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requirePayoutsAdmin } from "../auth";

export const adminGetPayoutErrors = createServerFn({ method: "GET" }).handler(
  async () => {
    requirePayoutsAdmin();
    const { data: failedRows } = await pg.nftRedemptions
      .raw()
      .select(
        "id,user_wallet,contract_id,token_id,nft_title,status,tx_hash,last_error,failed_at,withdrawn_at"
      )
      .not("last_error", "is", null)
      .order("failed_at", { ascending: false })
      .limit(50);
    return {
      recentFailures: (failedRows ?? []) as Array<{
        id: string;
        user_wallet: string;
        contract_id: string;
        token_id: string;
        nft_title: string | null;
        status: string;
        tx_hash: string | null;
        last_error: string | null;
        failed_at: string | null;
        withdrawn_at: string | null;
      }>,
    };
  }
);

export const adminClearPayoutErrorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ rowId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    await pg.nftRedemptions
      .raw()
      .update({ last_error: null, failed_at: null })
      .eq("id", data.rowId);
    return { ok: true };
  });
