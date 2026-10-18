// Токены, про которые клиент уже знает: награда за них выдана.
//
// Зачем: список NFT на кошельке приезжает из индексатора и отстаёт. Игрок
// вводит NFT, список ещё показывает её как доступную, игрок жмёт «Ввести» —
// платит газ за подпись, а сервер отвечает «за эту NFT бокс уже выдан»
// (проверка стоит ПОСЛЕ подписи). Отсюда вторая половина жалобы: «пак появился
// ещё раз на ввод, и опять ошибка».
//
// Держим отметки локально: успешный ввод и отказ «уже выдано» гасят кнопку
// сразу, до всякой подписи.
//
// Коротко — десять минут, а не сутки: дальше список честно решает сервер по
// кругам NFT (nft-cycle.ts). Суточная отметка прятала номер и тогда, когда он
// законно возвращался к тому же игроку: склад переиспользует номера.

export type BlockReason = "done" | "already";

type Marks = Record<string, { reason: BlockReason; at: number }>;

const KEY = "nft-input-blocked";
/** Десять минут: индексатор догоняет за секунды, остальное решает сервер. */
const TTL_MS = 10 * 60_000;

export function blockKey(contract: string, tokenId: string): string {
  return `${contract}:${tokenId}`;
}

function read(): Marks {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Marks;
    const now = Date.now();
    const live: Marks = {};
    for (const [k, v] of Object.entries(all)) {
      if (v && typeof v.at === "number" && now - v.at < TTL_MS) live[k] = v;
    }
    return live;
  } catch {
    return {};
  }
}

function write(m: Marks): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* */
  }
}

/** Отметить токены как «уже в игре». */
export function markBlocked(contract: string, tokenIds: string[], reason: BlockReason): void {
  if (tokenIds.length === 0) return;
  const m = read();
  const at = Date.now();
  for (const id of tokenIds) m[blockKey(contract, id)] = { reason, at };
  write(m);
}

/** Снимок отметок — читаем один раз на открытие модалки. */
export function readBlocked(): Marks {
  const m = read();
  write(m); // заодно чистим протухшие
  return m;
}

/** Фразы сервера, означающие «эта NFT уже зачтена». */
const ALREADY_RE = /уже выдан|уже зачли|уже зачт|already (issued|granted|counted|credited)/i;

export function isAlreadyReason(reason: string): boolean {
  return ALREADY_RE.test(reason);
}
