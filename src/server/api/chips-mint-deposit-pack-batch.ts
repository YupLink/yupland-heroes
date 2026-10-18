// Батч-ввод пак-NFT: несколько токенов одной транзакцией.
// Отделено от chips-mint-deposit-pack.ts, чтобы держать файлы ≤250 строк.
// Выдачу стережёт круг NFT (nft-cycle.ts) — вечного замка по номеру больше нет.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { fetchSendlerNftById } from "../sendler";
import { getCurrentWallet } from "../auth";
import { CHIP_MINT_RECIPIENT } from "./chips-mint-helpers";
import {
  claimNftInputTx,
  getPackInputMap,
  getPackInputReverseMap,
  isChipNftTitle,
  packInputKey,
  stripLeadCount,
  resolvePackForNftTitle,
  fetchOnchainNftTitle,
  journalStart,
  journalGranted,
  journalFailed,
} from "./chips-mint-deposit-helpers";
import { closeMintedChipForPackSwap } from "./chips-mint-deposit-issue";
import { checkNftInputTx, sayToPlayer, settleUnconfirmed } from "./chips-mint-deposit-verify";
import { notePendingInput } from "./nft-input-pending";
import { creditPacks, OLD_TRANSFER_NOTE } from "./nft-cycle-credit";
import { openBindings } from "./nft-cycle-read";

const CHIP_NOT_PACK = "Это не пак, а твоя выведенная фишка — введи её как фишку";

export const depositManyAsPack = createServerFn({ method: "POST" })
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
    const receiverId = process.env.NEAR_SIGNER_ACCOUNT_ID;
    if (!receiverId) throw new Error("Системный кошелёк не настроен");

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
      receiverId,
      kind: "pack",
    });
    // Ожидающие подтверждения и отказанные оформляются отдельно: первым обещаем
    // догон, вторым отвечаем по делу. Дальше в выдачу идут ТОЛЬКО подтверждённые
    // — раньше один неподтверждённый токен ронял всю партию.
    const settled = await settleUnconfirmed({
      check,
      wallet,
      contract,
      txHash: data.txHash,
      kind: "pack",
    });
    const okTokenIds = check.confirmed;
    // Отсекаем выведенные фишки ДО выдачи: круг, открытый выводом фишки, — это
    // наша фишка, её место во вводе фишек.
    const mintedByToken = await openBindings(contract, okTokenIds);

    // Названия тоже узнаём до квитанции: фишку, которой нет в индексе (старый
    // минт), видно только по имени «… (N Stars)».
    const titles = new Map<string, string>();
    for (const tokenId of okTokenIds) {
      let title = await fetchOnchainNftTitle(contract, tokenId);
      if (!title) {
        const nft = await fetchSendlerNftById(contract, tokenId).catch(() => null);
        title = (nft?.title ?? "").trim() || null;
      }
      if (title) titles.set(tokenId, title);
    }
    // Явная связка админа под это название — разрешённый обмен фишки на пак.
    // Карту читаем ОДИН раз: раньше был запрос на каждый токен батча.
    const inputMap = await getPackInputMap();
    const allowedByAdmin = new Set<string>();
    for (const [tokenId, title] of titles) {
      if (inputMap[packInputKey(contract, title)]) allowedByAdmin.add(tokenId);
    }
    const isChipToken = (t: string) =>
      !allowedByAdmin.has(t) && (mintedByToken.has(t) || isChipNftTitle(titles.get(t) ?? ""));
    const packTokenIds = okTokenIds.filter((t) => !isChipToken(t));
    // Пусто из-за фишек — это отказ по делу. Пусто из-за ожидания — нет: там
    // перевод состоялся, и падать нельзя, иначе игрок снова увидит ошибку.
    if (packTokenIds.length === 0 && okTokenIds.length > 0) throw new Error(CHIP_NOT_PACK);

    const packMap = await getPackInputReverseMap();
    const pendingExtra: string[] = [];
    const results: Array<{
      tokenId: string;
      packId: string;
      packName: string;
      grantCount: number;
    }> = [];
    const failed: Array<{ tokenId: string; reason: string }> = [
      ...settled.failures,
      ...okTokenIds.filter(isChipToken).map((tokenId) => ({ tokenId, reason: CHIP_NOT_PACK })),
    ];

    for (const tokenId of packTokenIds) {
      // ВЕСЬ разбор — ДО зачёта квитанции. Раньше отметка ставилась раньше, чем
      // становилось известно, какой пак выдавать: не нашлась связка «NFT → пак»
      // — и токен хоронился навсегда (квитанция зачтена, бокса нет, повторный
      // ввод отбит «уже зачли»). Так и терялись паки.
      try {
        const title = titles.get(tokenId);
        if (!title) {
          failed.push({ tokenId, reason: "title не определён" });
          continue;
        }
        const { count: leadCount } = stripLeadCount(title);
        const packId = await resolvePackForNftTitle(contract, title);
        if (!packId) {
          failed.push({ tokenId, reason: `нет связки с паком для «${title}»` });
          continue;
        }
        const pack = await pg.chipPacks.findOne({ id: packId });
        if (!pack) {
          failed.push({ tokenId, reason: "пак не найден" });
          continue;
        }
        const isMysticBox = (pack as { kind?: string }).kind === "mystic";
        const grantCount = isMysticBox ? Math.max(1, leadCount) : 1;

        // Дальше — необратимая часть, и она под журналом: по жалобе игрока
        // видно, на каком шаге всё встало.
        const atMs = check.atMs.get(tokenId);
        // Без времени перевода круг не найти — отдаём догону, как ожидающий.
        if (atMs == null) {
          pendingExtra.push(tokenId);
          notePendingInput(wallet);
          continue;
        }
        const transfer = { wallet, contract, tokenId, txHash: data.txHash, atMs, source: "deposit_batch" };
        await journalStart({ ...transfer, kind: "pack" });
        await claimNftInputTx(wallet, data.txHash, tokenId).catch(() => false);
        let out: Awaited<ReturnType<typeof creditPacks>>;
        try {
          out = await creditPacks(transfer, { packId, count: grantCount });
        } catch (e) {
          await journalFailed({ ...transfer, error: e instanceof Error ? e.message : "ошибка выдачи" });
          throw e;
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
        if (out.kind === "none") {
          failed.push({ tokenId, reason: out.reason });
          continue;
        }
        // Повтор той же партии: боксы уже выданы — показываем их, а не отказ.
        if (out.kind === "already") {
          results.push({ tokenId, packId, packName: pack.name, grantCount });
          continue;
        }
        const grantIds = out.grantIds;
        if (allowedByAdmin.has(tokenId)) {
          await closeMintedChipForPackSwap(contract, tokenId, wallet);
        }
        await journalGranted({ contract, tokenId, txHash: data.txHash, grantIds });
        results.push({ tokenId, packId, packName: pack.name, grantCount });
      } catch (e) {
        failed.push({
          tokenId,
          reason: e instanceof Error ? e.message : "ошибка",
        });
      }
    }
    // Ожидающие — отдельным полем, а НЕ в failures: перевод состоялся, и
    // показывать за него «не прошло» — враньё. В results их тоже нет: там
    // список выданного, и строка-обещание среди наград читалась бы как награда.
    return {
      ok: true,
      deposited: results.length,
      failed: failed.length,
      results,
      failures: failed,
      pending: [...settled.pendingTokens, ...pendingExtra],
      pendingNote: settled.pendingNote,
    };
  });
