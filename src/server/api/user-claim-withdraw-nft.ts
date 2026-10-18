import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner } from "../sendler";
import { requireLinkedTelegram } from "./user-claims-inventory";
import { getSisterWallets } from "./user-claims-core";
import { NFT_PRIZE_OWNER } from "./user-claims-types";

export const withdrawMyNfts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        recipient: z.string().min(2).max(64),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    const sisters = await getSisterWallets(wallet);

    const recipient = data.recipient.trim().toLowerCase();
    const validNear =
      /^([a-z0-9_-]{2,64}|[a-z0-9_-]+(\.[a-z0-9_-]+)+|[a-f0-9]{64})$/.test(
        recipient
      );
    if (!validNear) {
      throw new Error("Невалидный NEAR-адрес получателя");
    }
    // Выводить можно ТОЛЬКО на свои адреса — та же граница, что у вывода
    // токенов (currency/withdraw.ts) и у минта фишки. Раньше здесь стояла
    // одна проверка «похоже на NEAR-адрес», и угнанная вкладка увозила весь
    // призовой инвентарь на чужой кошелёк одним запросом.
    const mine = sisters.map((w) => w.trim().toLowerCase());
    if (!mine.includes(recipient)) {
      throw new Error("Выводить можно только на свой кошелёк");
    }

    const { data: pending } = await pg.nftRedemptions
      .raw()
      .select("id,contract_id,token_id,nft_title,user_wallet")
      .in("user_wallet", sisters)
      .eq("status", "pending");
    const rows = (pending ?? []) as Array<{
      id: string;
      contract_id: string;
      token_id: string;
      nft_title: string | null;
      user_wallet: string;
    }>;
    if (rows.length === 0) throw new Error("Нет pending NFT");

    const byContract = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byContract.get(r.contract_id) ?? [];
      arr.push(r);
      byContract.set(r.contract_id, arr);
    }

    const results: Array<{
      contract: string;
      count: number;
      txHash?: string;
      error?: string;
    }> = [];

    for (const [contract, list] of byContract.entries()) {
      const chunk = list.slice(0, 10);

      let candidatesByTitle = new Map<string, string[]>();
      try {
        const items = await fetchSendlerNftsByOwner(contract, NFT_PRIZE_OWNER);
        for (const it of items) {
          if (!it.title) continue;
          const norm = normalizeTitle(it.title);
          const arr = candidatesByTitle.get(norm) ?? [];
          arr.push(it.token_id);
          candidatesByTitle.set(norm, arr);
        }
      } catch (err) {
        const msg = `Sendler: ${err instanceof Error ? err.message : String(err)}`;
        const { writePayoutError } = await import("../payoutSafety");
        await writePayoutError(list.map((r) => r.id), msg);
        results.push({ contract, count: 0, error: msg });
        continue;
      }

      const allTokenIdsOnSendler = Array.from(candidatesByTitle.values()).flat();
      const usedSet = new Set<string>();
      if (allTokenIdsOnSendler.length > 0) {
        const { data: used } = await pg.nftRedemptions
          .raw()
          .select("token_id")
          .eq("contract_id", contract)
          .in("token_id", allTokenIdsOnSendler);
        for (const u of (used ?? []) as Array<{ token_id: string }>) {
          usedSet.add(u.token_id);
        }
      }

      const usedNow = new Set<string>();
      const assignments: Array<{
        redemptionId: string;
        oldTokenId: string;
        newTokenId: string;
      }> = [];
      const unmatched: typeof chunk = [];
      for (const r of chunk) {
        const titleKey = r.nft_title
          ? normalizeTitle(r.nft_title)
          : null;
        let picked: string | null = null;
        if (allTokenIdsOnSendler.includes(r.token_id) && !usedNow.has(r.token_id)) {
          picked = r.token_id;
        } else if (titleKey) {
          const cands = candidatesByTitle.get(titleKey) ?? [];
          for (const tid of cands) {
            if (usedSet.has(tid) && tid !== r.token_id) continue;
            if (usedNow.has(tid)) continue;
            picked = tid;
            break;
          }
        }
        if (picked) {
          usedNow.add(picked);
          assignments.push({
            redemptionId: r.id,
            oldTokenId: r.token_id,
            newTokenId: picked,
          });
        } else {
          unmatched.push(r);
        }
      }

      if (unmatched.length > 0) {
        const msg = `Нет свободных NFT для: ${unmatched.map((u) => u.nft_title ?? `#${u.token_id}`).join(", ")}`;
        const { writePayoutError } = await import("../payoutSafety");
        await writePayoutError(unmatched.map((u) => u.id), msg);
        results.push({ contract, count: 0, error: msg });
      }
      if (assignments.length === 0) continue;

      try {
        const lockedIds: string[] = [];
        for (const a of assignments) {
          const { data: locked, error: lockErr } = await pg.nftRedemptions
            .raw()
            .update({
              status: "withdrawn",
              withdrawn_at: new Date().toISOString(),
              token_id: a.newTokenId,
              last_error: null,
              failed_at: null,
            })
            .eq("id", a.redemptionId)
            .eq("status", "pending")
            .select("id");
          if (lockErr) continue;
          if ((locked ?? []).length > 0) lockedIds.push(a.redemptionId);
        }
        if (lockedIds.length === 0) {
          results.push({ contract, count: 0, error: "race — пусто" });
          continue;
        }

        const { ftTransferNftBatch } = await import("../near");
        // Момент ДО отправки — начало кругов NFT этих номеров.
        const outAt = Date.now();
        const r = await ftTransferNftBatch({
          nftContract: contract,
          receiverId: recipient,
          tokenIds: assignments
            .filter((a) => lockedIds.includes(a.redemptionId))
            .map((a) => a.newTokenId),
          onSigned: async (txHash) => {
            await pg.nftRedemptions
              .raw()
              .update({ tx_hash: txHash })
              .in("id", lockedIds);
          },
        });
        results.push({ contract, count: lockedIds.length, txHash: r.txHash });
        // Номера уехали со склада призом — открываем им круги NFT. Без этого
        // призёр, получивший токен, который кто-то уже вводил, упирался в
        // «уже выдано» (склад переиспользует номера). Приз уже отправлен —
        // сбой записи только логируем: ввод тогда заведёт неявный круг сам.
        const { openCycle } = await import("./nft-cycle");
        for (const a of assignments.filter((x) => lockedIds.includes(x.redemptionId))) {
          await openCycle({
            contract,
            tokenId: String(a.newTokenId),
            source: "prize",
            by: recipient,
            tx: r.txHash,
            atMs: outAt,
          }).catch((e: unknown) =>
            console.warn(`[claim-withdraw-nft] круг ${a.newTokenId}: ${e instanceof Error ? e.message : e}`),
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const assignmentIds = assignments.map((a) => a.redemptionId);
        await pg.nftRedemptions
          .raw()
          .update({ status: "pending", withdrawn_at: null })
          .in("id", assignmentIds)
          .eq("status", "withdrawn")
          .is("tx_hash", null);
        const { writePayoutError } = await import("../payoutSafety");
        await writePayoutError(assignmentIds, msg);
        results.push({ contract, count: 0, error: msg });
      }
    }
    return { results };
  });
