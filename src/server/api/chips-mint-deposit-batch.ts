// Ввод NFT-фишек пачкой: depositManyAsChip.
//
// То же правило, что у одиночного ввода: выдачу стережёт круг NFT
// (nft-cycle.ts) — один перевод, одна фишка. Вечных замков по номеру нет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { googleOnlyWallet } from "@/lib/auth/entryRules";
import { CHIP_MINT_RECIPIENT } from "./chips-mint-helpers";
import {
  claimNftInputTx,
  journalStart,
  journalGranted,
  journalFailed,
} from "./chips-mint-deposit-helpers";
import { checkNftInputTx, sayToPlayer, settleUnconfirmed } from "./chips-mint-deposit-verify";
import { notePendingInput } from "./nft-input-pending";
import { creditChip, OLD_TRANSFER_NOTE } from "./nft-cycle-credit";
import { cycleGrant } from "./nft-cycle-read";
import { chipIdentityByTitle } from "./nft-chip-identity";

export const depositManyAsChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              contract: z.string().min(3),
              tokenId: z.string().min(1),
            }),
          )
          .min(1)
          .max(120),
        txHash: z.string().min(20).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Нужно подключить кошелёк");
    // «Только Google» (§8.127): «Ввести NFT» нет — кошелька у аккаунта нет и не будет.
    if (googleOnlyWallet(wallet)) throw new Error("google.noNft");

    const byContract = new Map<string, string[]>();
    for (const it of data.items) {
      const arr = byContract.get(it.contract) ?? [];
      arr.push(it.tokenId);
      byContract.set(it.contract, arr);
    }
    if (byContract.size > 1) {
      throw new Error("Batch-ввод поддерживает только NFT одного контракта в одной tx");
    }
    const [contract, tokenIds] = [...byContract.entries()][0];

    const check = await checkNftInputTx({
      wallet,
      contract,
      tokenIds,
      txHash: data.txHash,
      receiverId: CHIP_MINT_RECIPIENT,
      kind: "chip",
    });
    // В выдачу — только подтверждённые: ожидание не отказ, и партию оно не роняет.
    const settled = await settleUnconfirmed({
      check,
      wallet,
      contract,
      txHash: data.txHash,
      kind: "chip",
    });
    const results: Array<{
      tokenId: string;
      chipId: string;
      templateId: string;
      level: number;
      templateName: string;
    }> = [];
    const failed: Array<{ tokenId: string; reason: string }> = [...settled.failures];

    const pending = [...settled.pendingTokens];
    for (const tokenId of check.confirmed) {
      const atMs = check.atMs.get(tokenId);
      // Без времени перевода круг не найти — отдаём догону, как ожидающий.
      if (atMs == null) {
        pending.push(tokenId);
        notePendingInput(wallet);
        continue;
      }
      const transfer = {
        wallet,
        contract,
        tokenId,
        txHash: data.txHash,
        atMs,
        source: "deposit_batch",
      };
      try {
        await journalStart({ ...transfer, kind: "chip" });
        // Квитанция по паре (tx, token) — для журнала и самолечения; выдачу
        // стережёт круг, а не она.
        await claimNftInputTx(wallet, data.txHash, tokenId).catch(() => false);
        const out = await creditChip(transfer, () => chipIdentityByTitle(contract, tokenId));
        if (out.kind === "none") {
          failed.push({ tokenId, reason: out.reason });
          await journalFailed({ ...transfer, error: out.reason });
          continue;
        }
        if (out.kind === "old") {
          failed.push({ tokenId, reason: sayToPlayer("chips.nft_before_cycles") });
          await journalFailed({ ...transfer, error: OLD_TRANSFER_NOTE });
          continue;
        }
        if (out.kind === "stale" || out.kind === "legacy") {
          failed.push({ tokenId, reason: "эту NFT уже зачли раньше" });
          if (out.kind === "legacy") await journalGranted({ ...transfer, grantIds: [], keepGranted: true });
          else await journalFailed({ ...transfer, error: "перевод из закрытого круга" });
          continue;
        }
        // Повтор той же партии: выдача уже есть — показываем её, а не отказ.
        if (out.kind === "already") {
          const got = await cycleGrant(out.cycleId);
          const chip = got?.ids[0] ? await pg.userChipInventory.findOne({ id: got.ids[0] }) : null;
          if (chip) {
            const tpl = await pg.chipTemplates.findOne({ id: chip.template_id });
            results.push({
              tokenId,
              chipId: chip.id,
              templateId: chip.template_id,
              level: Number(chip.level),
              templateName: tpl?.name ?? "",
            });
          }
          continue;
        }
        await journalGranted({ ...transfer, grantIds: [out.chipId] });
        const tpl = await pg.chipTemplates.findOne({ id: out.identity.templateId });
        results.push({
          tokenId,
          chipId: out.chipId,
          templateId: out.identity.templateId,
          level: out.identity.level,
          templateName: tpl?.name ?? "",
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ tokenId, reason });
        await journalFailed({ ...transfer, error: reason }).catch(() => {});
      }
    }

    // Ожидающие — отдельным полем, а не в отказы и не в выдачу: перевод
    // состоялся, но фишки за него ещё нет. Подробнее — в pack-batch.
    return {
      ok: true,
      deposited: results.length,
      failed: failed.length,
      results,
      failures: failed,
      pending,
      pendingNote: settled.pendingNote,
    };
  });
