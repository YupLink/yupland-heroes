// Ввод одной NFT-фишки в игру: depositNftAsChip.
//
// Выдачу стережёт круг NFT (nft-cycle.ts): один перевод — одна фишка, и
// перевод обязан быть из текущего круга номера. Прежние вечные замки по номеру
// (живая фишка за токен, открытая запись чеканки) убраны — склад переиспользует
// номера, и они запирали ввод каждому следующему владельцу.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
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

export const depositNftAsChip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contract: z.string().min(3),
        tokenId: z.string().min(1),
        txHash: z.string().min(20).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Нужно подключить кошелёк");

    const check = await checkNftInputTx({
      wallet,
      contract: data.contract,
      tokenIds: [data.tokenId],
      txHash: data.txHash,
      receiverId: CHIP_MINT_RECIPIENT,
      kind: "chip",
    });
    const settled = await settleUnconfirmed({
      check,
      wallet,
      contract: data.contract,
      txHash: data.txHash,
      kind: "chip",
    });
    // Ждём подтверждения — это не отказ: перевод состоялся, награду доведёт
    // догон (журнал уже помечен, отложенная попытка заведена).
    if (settled.pendingTokens.length > 0) {
      return { ok: true as const, pending: true as const, note: settled.pendingNote };
    }
    const rejected = settled.failures[0]?.reason;
    if (rejected) throw new Error(rejected);

    // Время перевода из сети — по нему перевод находит свой круг. Нет его —
    // не подставляем «сейчас» (зачтёт не в тот круг): отдаём догону, у него
    // время из истории. Игроку — то же обещание, что при ожидании индекса.
    const atMs = check.atMs.get(data.tokenId);
    if (atMs == null) {
      // След для догона: журнал и квитанция — по ним самолечение найдёт перевод.
      const base = { wallet, contract: data.contract, tokenId: data.tokenId, txHash: data.txHash };
      await journalStart({ ...base, kind: "chip" });
      await claimNftInputTx(wallet, data.txHash, data.tokenId).catch(() => false);
      // Проверка сняла пометку «игрок ждёт» (индекс ответил), а выдать ещё
      // нельзя — ставим обратно, чтобы отложенный догон сходил за временем.
      notePendingInput(wallet);
      return { ok: true as const, pending: true as const, note: settled.pendingNote };
    }
    const transfer = {
      wallet,
      contract: data.contract,
      tokenId: data.tokenId,
      txHash: data.txHash,
      atMs,
      source: "deposit",
    };
    await journalStart({ ...transfer, kind: "chip" });
    // Квитанция остаётся для журнала и самолечения; выдачу стережёт круг.
    await claimNftInputTx(wallet, data.txHash, data.tokenId).catch(() => false);

    let out: Awaited<ReturnType<typeof creditChip>>;
    try {
      out = await creditChip(transfer, () => chipIdentityByTitle(data.contract, data.tokenId));
    } catch (e) {
      await journalFailed({ ...transfer, error: e instanceof Error ? e.message : "ошибка выдачи" });
      throw e;
    }
    if (out.kind === "none") {
      await journalFailed({ ...transfer, error: out.reason });
      throw new Error("Для этого NFT нет связки с фишкой");
    }
    if (out.kind === "old") {
      await journalFailed({ ...transfer, error: OLD_TRANSFER_NOTE });
      throw new Error(sayToPlayer("chips.nft_before_cycles"));
    }
    if (out.kind === "stale" || out.kind === "legacy") {
      // Выдано вне кругов — перевод зачтён; закрытый чужим вводом круг — на разбор.
      if (out.kind === "legacy") await journalGranted({ ...transfer, grantIds: [], keepGranted: true });
      else await journalFailed({ ...transfer, error: "перевод из закрытого круга" });
      throw new Error("Этот перевод уже зачтён раньше — NFT вернулась в игру по нему");
    }

    // Повторный тап того же ввода — отвечаем тем, что уже выдано, а не ошибкой.
    const chipId =
      out.kind === "granted" ? out.chipId : ((await cycleGrant(out.cycleId))?.ids[0] ?? null);
    if (out.kind === "granted") {
      await journalGranted({ ...transfer, grantIds: [out.chipId] });
    }

    const chip = chipId ? await pg.userChipInventory.findOne({ id: chipId }) : null;
    const tpl = chip ? await pg.chipTemplates.findOne({ id: chip.template_id }) : null;
    return {
      ok: true,
      chipId: chipId ?? "",
      templateId: chip?.template_id ?? "",
      level: Number(chip?.level ?? 0),
      templateName: tpl?.name ?? "",
    };
  });
