// Текст итога ввода NFT — по факту выдачи, а не «на глазок».
//
// Было: за мистические боксы игрок читал «Введено 1 фишек в игру 🎉» — и шёл в
// «Фишки» → инвентарь, где пусто: боксы лежат в подвкладке «Паки», а то, что из
// них выпадет, — в «Инвентарь». Промах в два хопа при формально успешной выдаче.
//
// Стало: собираем строки из results[] сервера (packName/grantCount,
// templateName/level) и сразу говорим, КУДА идти, — плюс кнопка перехода.
import type { ChipsSubTab } from "@/lib/chipsNav";
import { labelForLevel } from "./levelLabel";
import type { DepositOutcome, OutcomeLine } from "./nftDepositOutcome";

type T = (key: string, params?: Record<string, string | number>) => string;

export type OutcomeView = {
  ok: boolean;
  title: string;
  /** «Мистический бокс ×2» — по строке на вид награды */
  lines: string[];
  /** куда идти забирать */
  where: string | null;
  /** цель кнопки-перехода */
  target: ChipsSubTab | null;
  cta: string | null;
  /** что не прошло */
  failLine: string | null;
  /**
   * Что доехало, но ещё подтверждается. Отдельно от failLine и своим тоном:
   * это обещание, а не жалоба, и игроку тут делать ровно ничего не нужно.
   */
  pendingLine: string | null;
};

function lineText(l: OutcomeLine): string {
  const name = l.level != null ? `${l.name} · ${labelForLevel(l.level)}` : l.name;
  return l.count > 1 ? `${name} ×${l.count}` : name;
}

export function viewOutcome(o: DepositOutcome, t: T): OutcomeView {
  const lines = [...o.packs, ...o.chips].map(lineText);
  const got = lines.length > 0;
  const hasPacks = o.packs.length > 0;
  const hasChips = o.chips.length > 0;

  const where = !got
    ? null
    : hasPacks && hasChips
      ? t("chips.nft_where_both")
      : hasPacks
        ? t("chips.nft_where_packs")
        : t("chips.nft_where_chips");

  // Паки требуют действия (их надо открыть) — ведём туда в первую очередь.
  const target: ChipsSubTab | null = !got ? null : hasPacks ? "packs" : "inventory";
  const cta = !got ? null : hasPacks ? t("chips.nft_go_packs") : t("chips.nft_go_chips");

  const failLine =
    o.failed > 0
      ? t("chips.nft_failed_n", { n: o.failed, reason: o.failText ?? t("chips.nft_fail_unknown") })
      : o.failText
        ? o.failText
        : null;

  // Язык берём здесь, а не с сервера: сервер о нём знает только по
  // Accept-Language, а клиент — по фактическому выбору игрока.
  const waiting = o.pending ?? 0;
  const pendingLine = waiting > 0 ? t("chips.nft_pending_n", { n: waiting }) : null;

  // Ожидание — не провал: перевод состоялся, награду доводит догон. Поэтому
  // экран не краснеет, а заголовок остаётся утвердительным.
  const title = got
    ? o.failed > 0 || o.failText
      ? t("chips.nft_result_part")
      : t("chips.nft_result_ok")
    : waiting > 0 && !failLine
      ? t("chips.nft_result_pending")
      : o.fatal
        ? t("chips.nft_result_not_sent")
        : t("chips.nft_result_fail");

  return {
    ok: (got || waiting > 0) && o.failed === 0 && !o.failText,
    title,
    lines,
    where,
    target,
    cta,
    failLine,
    pendingLine,
  };
}
