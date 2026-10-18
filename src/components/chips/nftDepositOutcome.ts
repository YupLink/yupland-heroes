// Итог ввода NFT — «квитанция», которая переживает закрытие окна.
//
// Было: результат жил в стейте модалки. Закрыл окно, перезагрузил страницу,
// свернул Telegram — и «что мне выдали» пропало навсегда, хотя на сервере всё
// выдано. Отсюда живая жалоба: «паки ушли, ничего не пришло» (по базе — пришло).
//
// Стало: итог пишется в localStorage сразу после ответа сервера (внутри
// mutationFn, а не в onSuccess — колбэк размонтированной модалки можно и не
// дождаться) и снимается только когда игрок его прочитал.

/** Строка выдачи: «Мистический бокс ×2». level — для фишек (уровень/звёзды). */
export type OutcomeLine = { name: string; count: number; level?: number };

export type DepositOutcome = {
  /** когда закончили (ms) */
  at: number;
  /** сколько NFT игрок отправил в этот заход */
  sent: number;
  /** выдано паков/боксов */
  packs: OutcomeLine[];
  /** выдано фишек */
  chips: OutcomeLine[];
  /** сколько NFT не прошло */
  failed: number;
  /** человеческая причина отказа (уже прогнана через humanError) */
  failText?: string;
  /** перевод вообще не состоялся (отказ до подписи) — награды не ждать */
  fatal?: boolean;
  /**
   * Сколько NFT доехало, но их награда ещё в пути: Sendler не успел
   * проиндексировать перевод за отведённое ожидание. Это НЕ отказ — догон
   * доводит выдачу сам, поэтому строка про них живёт отдельно от `failed`.
   */
  pending?: number;
  /** Готовое обещание игроку с сервера — уже на его языке. */
  pendingNote?: string;
};

const KEY = "nft-deposit-receipt";
/** Неделя: за это время игрок точно зайдёт, а протухшую квитанцию не покажем. */
const TTL_MS = 7 * 24 * 3600_000;

export function createOutcome(sent: number): DepositOutcome {
  return { at: Date.now(), sent, packs: [], chips: [], failed: 0 };
}

/** Что-нибудь выдано? */
export function hasGrants(o: DepositOutcome): boolean {
  return o.packs.length > 0 || o.chips.length > 0;
}

/** Складываем одинаковые названия в одну строку со счётчиком. */
export function addLine(list: OutcomeLine[], name: string, count: number, level?: number): void {
  const ex = list.find((l) => l.name === name && l.level === level);
  if (ex) ex.count += count;
  else list.push({ name, count, level });
}

export function saveOutcome(o: DepositOutcome): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* приватный режим — переживём, экран результата всё равно покажем */
  }
}

export function readOutcome(): DepositOutcome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DepositOutcome;
    if (!o || typeof o.at !== "number" || Date.now() - o.at > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    // Пустой итог показывать нечего (например, отказ до подписи кошелька).
    // Ожидание пустым не считается: игрок вернулся именно за ним.
    if (!hasGrants(o) && !o.failText && !o.pending) return null;
    return { ...o, packs: o.packs ?? [], chips: o.chips ?? [] };
  } catch {
    return null;
  }
}

export function clearOutcome(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
