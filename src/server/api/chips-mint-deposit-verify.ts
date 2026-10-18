// Проверка перевода NFT перед выдачей. Источник истины — Sendler.
//
// Возвращает не «да/нет», а три исхода на каждый токен, потому что их ровно три:
//   confirmed — перевод доказан, можно выдавать;
//   rejected  — Sendler сказал определённо, что этот перевод не наш;
//   pending   — индекс ещё не догнал. Перевод состоялся, доказательства пока нет.
//
// Разница между rejected и pending и есть суть правки. Раньше их не различали:
// «пока не вижу» превращалось в отказ игроку, хотя NFT уже лежала у нас на
// складе. Замеры задержки индексации — в шапке nft-input-proof.ts.
import { getRequestHeader } from "@tanstack/react-start/server";
import { dict as chipsNftDict } from "@/lib/translations/chips-nft";
import { proveNftTransfer } from "./nft-input-proof";
import { onchainFailureReason } from "./chips-mint-deposit-verify-rpc";
import { journalCheckOutcome } from "./chips-mint-deposit-receipt";
import { clearPendingInput, notePendingInput } from "./nft-input-pending";

export type NftInputCheck = {
  /** Токены, за которые можно выдавать прямо сейчас. */
  confirmed: string[];
  /** Время их перевода в сети (мс) — по нему ввод находит свой круг NFT. */
  atMs: Map<string, number>;
  /** Токен → определённая причина отказа. */
  rejected: Map<string, string>;
  /** Токены, чьё подтверждение ещё в пути. Отказом не являются. */
  pending: string[];
  /**
   * Транзакция провалилась в сети: ждать нечего, NFT осталась у игрока.
   * Единственный случай, когда pending честно превращается в отказ.
   */
  fatal: string | null;
  /** Сколько ждали подтверждения и сколько раз спросили — для журнала. */
  waitedMs: number;
  attempts: number;
};

export async function checkNftInputTx(args: {
  wallet: string;
  contract: string;
  tokenIds: string[];
  txHash: string;
  receiverId: string;
  kind: "pack" | "chip";
  budgetMs?: number;
}): Promise<NftInputCheck> {
  // Журнал и отложенный догон заводим ДО ожидания, а не после.
  //
  // Ожидание длится до 25 секунд, и всё это время соединение держит игрок. Обрыв
  // на середине (свернул телеграм, метро, переключение сети) раньше означал бы
  // полную амнезию: строки в журнале нет, догон не заведён, NFT на складе, а у
  // игрока — сетевая ошибка. Теперь след появляется сразу, и обещание
  // отрабатывается даже для тех, кто ответа так и не дождался.
  //
  // Записанному тут доверять нельзя — это то, что прислал клиент. Оба
  // потребителя журнала (nft-input-stuck, nft-input-selfheal) знают об этом и
  // берут из строки только кошелёк, разбирая его историю в Sendler заново.
  for (const tokenId of args.tokenIds) {
    await journalCheckOutcome({
      wallet: args.wallet,
      contract: args.contract,
      tokenId,
      txHash: args.txHash,
      kind: args.kind,
      outcome: "waiting",
      reason: "проверка началась",
    });
  }
  notePendingInput(args.wallet);

  const proof = await proveNftTransfer(args);
  const rejected = new Map(proof.rejected);
  let pending = proof.pending;
  let fatal: string | null = null;

  // Спрашиваем сеть только когда осталось непонятное — и только затем, чтобы
  // отличить «ещё индексируется» от «не состоялось и не состоится».
  if (pending.length > 0) {
    fatal = await onchainFailureReason({ wallet: args.wallet, txHash: args.txHash });
    if (fatal) {
      for (const t of pending) rejected.set(t, fatal);
      pending = [];
    }
  }

  const check: NftInputCheck = {
    confirmed: [...proof.confirmed],
    atMs: proof.atMs,
    rejected,
    pending,
    fatal,
    waitedMs: proof.waitedMs,
    attempts: proof.attempts,
  };
  if (pending.length > 0 || rejected.size > 0) {
    console.warn(
      `[nft-input] tx ${args.txHash.slice(0, 10)}… от ${args.wallet}: ` +
        `подтверждено ${check.confirmed.length}, ждут ${pending.length}, ` +
        `отказано ${rejected.size}; ждали ${Math.round(proof.waitedMs / 1000)}с ` +
        `за ${proof.attempts} попыток`,
    );
  } else {
    // Ждать нечего: снимаем пометку, заодно отменяя заведённые выше отложенные
    // догоны — они сами проверяют её перед каждой попыткой.
    clearPendingInput(args.wallet);
  }
  return check;
}

/**
 * Язык игрока для строк, которые сервер отдаёт готовым текстом. Словари живут
 * на клиенте, но одна строка («придёт в течение минуты») уезжает внутрь
 * results[] и перевести её там уже некому. Accept-Language — единственное, что
 * сервер о языке знает; правило то же, что в store.ts: русскоязычная локаль → ru.
 */
function playerLang(): "ru" | "en" {
  try {
    const h = (getRequestHeader("accept-language") ?? "").toLowerCase();
    if (!h) return "ru";
    return /\b(ru|be|uk|kk|ky|hy|az|uz|tg|mo)\b/.test(h) ? "ru" : "en";
  } catch {
    return "ru";
  }
}

function say(key: string, lang: "ru" | "en"): string {
  return chipsNftDict[key]?.[lang] ?? key;
}

/** Строка словаря на языке игрока — для причин, уходящих в ответ готовым текстом. */
export function sayToPlayer(key: string): string {
  return say(key, playerLang());
}

export type UnconfirmedSettlement = {
  /** Токены, чей перевод ещё подтверждается. Отказом НЕ являются. */
  pendingTokens: string[];
  /** Готовая строка игроку про эти токены — уже на его языке. */
  pendingNote: string;
  /** Настоящие отказы: тут причина по делу. */
  failures: Array<{ tokenId: string; reason: string }>;
};

/**
 * Разбирает всё, что не подтвердилось, и оформляет обещание игроку.
 *
 * Строки в журнале к этому моменту уже есть — их завёл checkNftInputTx до
 * ожидания. Здесь мы только доводим их до итога: отказанным ставим 'failed' с
 * причиной, ожидающим — уточняем, сколько именно прождали. Пометка «игрок ждёт»
 * тоже стоит с тех пор; снимает её сам checkNftInputTx, когда ждать нечего.
 *
 * Ожидающим отдаём строку «придёт в течение минуты» вместо ошибки: перевод
 * состоялся, врать про отказ нельзя.
 */
export async function settleUnconfirmed(args: {
  check: NftInputCheck;
  wallet: string;
  contract: string;
  txHash: string;
  kind: "pack" | "chip";
}): Promise<UnconfirmedSettlement> {
  const { check } = args;
  const lang = playerLang();
  const failures: Array<{ tokenId: string; reason: string }> = [];

  for (const [tokenId, reason] of check.rejected) {
    failures.push({ tokenId, reason });
    await journalCheckOutcome({
      wallet: args.wallet,
      contract: args.contract,
      tokenId,
      txHash: args.txHash,
      kind: args.kind,
      outcome: "rejected",
      reason,
    });
  }

  // Ожидание в очередь: по нему пройдёт проверка через минуту, а игрок получит
  // уведомление «NFT зачислена». Ключ по токену — повторная отправка той же
  // NFT не плодит вторую очередь.
  if (check.pending.length > 0) {
    const { noteCreditWait } = await import("./credit-wait");
    await noteCreditWait({
      accountId: await (await import("./user-shared")).accountIdOf(args.wallet),
      id: `nft:${args.contract}:${check.pending[0]}`,
      kind: "nft_input",
      wallet: args.wallet,
      txHash: args.txHash,
    }).catch(() => {});
  }

  for (const tokenId of check.pending) {
    await journalCheckOutcome({
      wallet: args.wallet,
      contract: args.contract,
      tokenId,
      txHash: args.txHash,
      kind: args.kind,
      outcome: "waiting",
      reason: `Sendler не отдал запись за ${Math.round(check.waitedMs / 1000)}с (${check.attempts} попыток)`,
    });
  }

  return {
    pendingTokens: check.pending,
    pendingNote: say(
      args.kind === "pack" ? "chips.nft_pending_pack" : "chips.nft_pending_chip",
      lang,
    ),
    failures,
  };
}
