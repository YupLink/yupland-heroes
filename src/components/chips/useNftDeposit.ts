import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { humanError } from "@/lib/humanError";
import { depositManyAsChip, depositManyAsPack, getNftInputInfo } from "@/server/api/chips-mint";
import { MAX_NFT_BATCH, type DepositNft } from "./nft-input-shared";
import { useCreditNotices } from "@/lib/hooks/useCreditNotices";
import {
  absorbChips,
  absorbFailures,
  absorbPacks,
  absorbPending,
  planChunks,
  sendChunkTx,
} from "./nftDepositBatch";
import {
  clearOutcome,
  createOutcome,
  hasGrants,
  saveOutcome,
  type DepositOutcome,
} from "./nftDepositOutcome";
import { isAlreadyReason, markBlocked } from "./nftInputBlocked";

type NftInputData = Awaited<ReturnType<typeof getNftInputInfo>>;

/**
 * Когда перечитывать экраны, если награда ещё в пути (мс от ответа сервера).
 *
 * Не поток событий и не сокет: ждать тут в худшем случае полторы минуты, а
 * push-канал пришлось бы держать живым через сворачивание телеграм-вебвью и
 * подмену сборки при деплое — машинерии больше, чем самого ожидания. Четыре
 * перезапроса дешевле и надёжнее.
 *
 * Такты подобраны под серверный догон (он ходит через 15, 40 и 90 секунд):
 * каждый заход случается ПОСЛЕ очередной попытки, а не до неё. Первый, на 6-й
 * секунде, — на случай, когда индекс догнал сразу за нашим ожиданием.
 */
const REFRESH_STEPS_MS = [6_000, 20_000, 45_000, 95_000];
/** Когда спросить «пришло?» — сразу после обещанной минуты и один раз следом. */
const NOTICE_STEPS_MS = [62_000, 100_000];

/** Что происходит прямо сейчас: подпись партии или выдача награды за неё. */
export type DepositProgress = { step: number; total: number; phase: "sign" | "issue" };

export function useNftDeposit(infoData: NftInputData | undefined) {
  const qc = useQueryClient();
  const { poll } = useCreditNotices();
  const [outcome, setOutcome] = useState<DepositOutcome | null>(null);
  const [progress, setProgress] = useState<DepositProgress | null>(null);

  /** Прочитал — снимаем и экран, и квитанцию на следующий заход. */
  const dismissOutcome = () => {
    clearOutcome();
    setOutcome(null);
  };

  const invalidateAll = () => {
    // Ключи ровно те, на которых сидят экраны. Раньше здесь стояли
    // «my-chip-pack-grants»/«chip-pack-grants», а вкладка «Паки» читает
    // «my-chip-packs» — выданный пак не появлялся до перезагрузки.
    //
    // refetchType: "all" — вкладка «Паки» в момент ввода не смонтирована
    // (модалка живёт в шапке), а суточный persist-кэш держит прежний ответ:
    // обычный invalidate до неактивного запроса не доходит.
    for (const key of [
      "depositable-nfts",
      "my-chip-packs",
      "my-mystic-packs",
      "my-chip-pack-grants",
      "my-chip-inventory",
      "my-chips-for-template",
      "my-training-chips",
      "chip-collection-detail",
      "my-game-items",
    ]) {
      void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
    }
  };

  // Награда ещё в пути — доносим её до экрана сами. Сессию перечитываем не для
  // данных: getSession дёргает самолечение ввода, а ожидающему игроку оно идёт
  // без очереди. То есть перезапрос не наблюдает за догоном, а подгоняет его.
  const pendingAt = outcome?.pending ? outcome.at : null;
  useEffect(() => {
    if (pendingAt == null) return;
    const timers = REFRESH_STEPS_MS.map((ms) =>
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["session"], refetchType: "all" });
        invalidateAll();
      }, ms),
    );
    // И отдельно — за новостями: обещали «в течение минуты», значит после
    // минуты игрок должен увидеть «NFT зачислена», а не гадать по инвентарю.
    timers.push(...NOTICE_STEPS_MS.map((ms) => setTimeout(() => void poll(), ms)));
    return () => timers.forEach(clearTimeout);
    // invalidateAll стабильна по смыслу (замыкает только qc); ключ эффекта —
    // момент ответа, чтобы новый ввод заводил новое расписание.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAt, qc]);

  /** Отказы партии: считаем и гасим кнопку у тех NFT, что уже зачтены. */
  const takeFailures = (
    acc: DepositOutcome,
    contract: string,
    failures: Array<{ tokenId: string; reason: string }>,
  ) => {
    absorbFailures(acc, failures);
    markBlocked(
      contract,
      failures.filter((f) => isAlreadyReason(f.reason)).map((f) => f.tokenId),
      "already",
    );
  };

  /**
   * Ожидающие подтверждения: кнопку гасим так же, как у выданных. NFT уже на
   * складе — оставить её кликабельной значит предложить отправить то, чего у
   * игрока больше нет.
   */
  const takePending = (
    acc: DepositOutcome,
    contract: string,
    r: { pending?: string[]; pendingNote?: string },
  ) => {
    markBlocked(contract, absorbPending(acc, r), "done");
  };

  const depositMany = useMutation({
    // Возвращаем ИТОГ, а не бросаем: частичный успех — норма (одна партия
    // прошла, вторая нет), и игроку надо показать обе половины сразу.
    mutationFn: async (nfts: DepositNft[]): Promise<DepositOutcome> => {
      const acc = createOutcome(nfts.length);
      let signedAny = false;
      try {
        if (!infoData) throw new Error("chips.config_loading");
        if (nfts.length === 0) throw new Error("chips.nothing_selected");
        if (nfts.length > MAX_NFT_BATCH) throw new Error("chips.too_many_nfts");

        const chunks = planChunks(nfts);
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          setProgress({ step: i + 1, total: chunks.length, phase: "sign" });
          const txHash = await sendChunkTx(c, infoData.receiverId);
          signedAny = true;
          setProgress({ step: i + 1, total: chunks.length, phase: "issue" });
          const items = c.tokenIds.map((tokenId) => ({ contract: c.contract, tokenId }));
          if (c.rewardType === "pack") {
            const r = await depositManyAsPack({ data: { items, txHash } });
            markBlocked(c.contract, absorbPacks(acc, r), "done");
            takeFailures(acc, c.contract, r.failures);
            takePending(acc, c.contract, r);
          } else {
            const r = await depositManyAsChip({ data: { items, txHash } });
            markBlocked(c.contract, absorbChips(acc, r), "done");
            takeFailures(acc, c.contract, r.failures);
            takePending(acc, c.contract, r);
          }
        }
      } catch (e) {
        acc.failText = humanError(e);
        // Ничего не подписали — значит, NFT остались на кошельке и ждать нечего.
        acc.fatal = !signedAny;
      }
      if (acc.failText) acc.failText = humanError(acc.failText);
      // Пишем квитанцию ЗДЕСЬ, а не в onSuccess: модалку могли закрыть посреди
      // операции, и колбэка размонтированного компонента можно не дождаться.
      // Отказ до подписи не храним — искать в игре нечего.
      if (hasGrants(acc) || signedAny) saveOutcome(acc);
      return acc;
    },
    onSuccess: (acc) => {
      invalidateAll();
      setOutcome(acc);
    },
    onError: (e: Error) => {
      const acc = createOutcome(0);
      acc.failText = humanError(e);
      acc.fatal = true;
      setOutcome(acc);
    },
    onSettled: () => setProgress(null),
  });

  return { depositMany, outcome, progress, dismissOutcome };
}
