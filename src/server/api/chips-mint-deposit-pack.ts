// Pack deposit: depositNftAsPack, depositManyAsPack, admin pack input config.
//
// Боксы за пак-NFT выдаются по кругу NFT (nft-cycle.ts): один перевод — одна
// выдача. Прежний замок «за этот токен бокс уже выдан» был вечным на номер и
// отбивал законный повторный ввод: склад отдаёт те же пак-токены наружу снова
// (призы, «заминтить мне»).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { fetchSendlerNftById } from "../sendler";
import { getCurrentWallet } from "../auth";
import { googleOnlyWallet } from "@/lib/auth/entryRules";
import {
  getPackInputMap,
  packInputKey,
  isChipNftTitle,
  resolvePackForNftTitle,
  stripLeadCount,
  claimNftInputTx,
  fetchOnchainNftTitle,
  journalStart,
  journalGranted,
  journalFailed,
} from "./chips-mint-deposit-helpers";
import { checkNftInputTx, sayToPlayer, settleUnconfirmed } from "./chips-mint-deposit-verify";
import { notePendingInput } from "./nft-input-pending";
import { closeMintedChipForPackSwap } from "./chips-mint-deposit-issue";
import { creditPacks, OLD_TRANSFER_NOTE } from "./nft-cycle-credit";
import { cycleGrant, openBindings } from "./nft-cycle-read";

/** Понятный отказ: это не пак, а выведенная фишка — её место в другом вводе. */
const CHIP_NOT_PACK = "Это не пак, а твоя выведенная фишка — введи её как фишку";
export const depositNftAsPack = createServerFn({ method: "POST" })
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
    // «Только Google» (§8.127): «Ввести NFT» нет — кошелька у аккаунта нет и не будет.
    if (googleOnlyWallet(wallet)) throw new Error("google.noNft");
    const receiverId = process.env.NEAR_SIGNER_ACCOUNT_ID;
    if (!receiverId) throw new Error("Системный кошелёк не настроен");

    const check = await checkNftInputTx({
      wallet,
      contract: data.contract,
      tokenIds: [data.tokenId],
      txHash: data.txHash,
      receiverId,
      kind: "pack",
    });
    const settled = await settleUnconfirmed({
      check,
      wallet,
      contract: data.contract,
      txHash: data.txHash,
      kind: "pack",
    });
    // Ждём подтверждения — это не отказ: перевод состоялся, награду доведёт
    // догон (журнал уже помечен, отложенная попытка заведена).
    if (settled.pendingTokens.length > 0) {
      return { ok: true as const, pending: true as const, note: settled.pendingNote };
    }
    const rejected = settled.failures[0]?.reason;
    if (rejected) throw new Error(rejected);
    // ВЕСЬ разбор — до зачёта квитанции: она служит стоп-сигналом для обоих
    // кронов, поэтому любой отказ после неё означает потерянную NFT.
    let title = await fetchOnchainNftTitle(data.contract, data.tokenId).catch(() => null);
    if (!title) {
      const nft = await fetchSendlerNftById(data.contract, data.tokenId).catch(() => null);
      title = (nft?.title ?? "").trim() || null;
    }
    if (!title) throw new Error("Не удалось определить title NFT");

    // Явная связка под это название — разрешённый обмен фишки на пак.
    const packMap = await getPackInputMap();
    const allowedByAdmin = !!packMap[packInputKey(data.contract, title)];
    if (!allowedByAdmin) {
      if (isChipNftTitle(title)) throw new Error(CHIP_NOT_PACK);
      // Круг открыт выводом фишки — это наша фишка, а не пак.
      const bound = await openBindings(data.contract, [data.tokenId]);
      if (bound.has(data.tokenId)) throw new Error(CHIP_NOT_PACK);
    }

    const { count: leadCount } = stripLeadCount(title);
    // Связка ищется по настройке, а если её нет — по совпадению названия
    // (и тогда запоминается). Иначе NFT уходило на склад впустую.
    const packId = await resolvePackForNftTitle(data.contract, title);
    if (!packId) throw new Error(`Для NFT «${title}» нет связки с паком`);

    const pack = await pg.chipPacks.findOne({ id: packId });
    if (!pack) throw new Error("Пак не найден");

    const isMysticBox = (pack as { kind?: string }).kind === "mystic";
    const grantCount = isMysticBox ? Math.max(1, leadCount) : 1;

    // Дальше необратимая часть — под журналом: по жалобе игрока видно,
    // на каком шаге ввод встал.
    const atMs = check.atMs.get(data.tokenId);
    const base = { wallet, contract: data.contract, tokenId: data.tokenId, txHash: data.txHash };
    await journalStart({ ...base, kind: "pack" });
    if (atMs == null) {
      // Без времени перевода круг не найти — догон доведёт, у него время из истории.
      await claimNftInputTx(wallet, data.txHash, data.tokenId).catch(() => false);
      // Проверка сняла пометку «игрок ждёт» (индекс ответил), а выдать ещё
      // нельзя — ставим обратно, чтобы отложенный догон сходил за временем.
      notePendingInput(wallet);
      return { ok: true as const, pending: true as const, note: settled.pendingNote };
    }
    const transfer = { ...base, atMs, source: "deposit" };
    // Квитанция — для журнала и самолечения; выдачу стережёт круг NFT.
    await claimNftInputTx(wallet, data.txHash, data.tokenId).catch(() => false);

    let out: Awaited<ReturnType<typeof creditPacks>>;
    try {
      out = await creditPacks(transfer, { packId, count: grantCount });
    } catch (e) {
      await journalFailed({ ...transfer, error: e instanceof Error ? e.message : "ошибка выдачи" });
      throw e;
    }
    if (out.kind === "old") {
      await journalFailed({ ...transfer, error: OLD_TRANSFER_NOTE });
      throw new Error(sayToPlayer("chips.nft_before_cycles"));
    }
    if (out.kind === "stale" || out.kind === "legacy") {
      if (out.kind === "legacy") await journalGranted({ ...transfer, grantIds: [], keepGranted: true });
      else await journalFailed({ ...transfer, error: "перевод из закрытого круга" });
      throw new Error("Этот перевод уже зачтён раньше — бокс за него выдан");
    }
    if (out.kind === "none") throw new Error(out.reason);
    const grantIds =
      out.kind === "granted" ? out.grantIds : ((await cycleGrant(out.cycleId))?.ids ?? []);
    if (out.kind === "granted") await journalGranted({ ...transfer, grantIds });
    // Обменяли фишку на пак — снимаем её с учёта выведенных.
    if (allowedByAdmin) await closeMintedChipForPackSwap(data.contract, data.tokenId, wallet);

    return {
      ok: true,
      grantId: grantIds[0],
      grantCount,
      packId,
      packName: pack.name,
    };
  });

// Батч-ввод живёт в своём модуле — ре-экспорт для существующих импортов.
export { depositManyAsPack } from "./chips-mint-deposit-pack-batch";

// Админские ручки переехали в свой модуль — ре-экспорт для существующих импортов.
export {
  adminGetPackInputConfig,
  adminSetPackInputMapEntry,
} from "./chips-mint-deposit-pack-admin";
