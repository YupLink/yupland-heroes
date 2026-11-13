// Круги NFT — чистая логика решения, без базы (её же гоняют тесты).
//
// ЗАЧЕМ. Склад переиспользует номера: один и тот же token_id уезжает наружу
// много раз — выводом фишки, призом, паком. Прежние проверки жили «по номеру
// навсегда» (живая фишка за токен, выданный бокс за токен, открытая запись
// чеканки) и запирали ввод каждому следующему владельцу. Одну такую дыру
// латали за другой — сентябрь 2026, жалобы игроков и призёров.
//
// МОДЕЛЬ. Круг — время, пока номер ходит снаружи склада. Выезд открывает круг
// (вывод фишки несёт с собой её номер — привязку), ввод закрывает ровно один.
// Правило одно:
//   перевод на склад в момент t зачитывается, если круг, открытый не позже t,
//   ещё не закрыт — или закрыт раньше t (значит, номер успел выехать мимо
//   нашего учёта, и это новый, неявный круг). Один перевод — одна выдача.
// Больше никаких вечных замков по номеру.

/** Номер фишки и её вид, закреплённые за NFT при выводе. */
export type CycleBinding = {
  chipId: string | null;
  serial: number | null;
  templateId: string;
  level: number;
  collectionId: string;
};

export type CycleRow = {
  id: string;
  /** Когда номер выехал со склада (мс). */
  openedAt: number;
  openSource: string;
  /** Когда его ввели обратно (мс) — время перевода. null — ещё снаружи. */
  closedAt: number | null;
  closeTx: string | null;
  binding: CycleBinding | null;
  /**
   * За закрытый круг уже записано, что выдано. Закрыт, но выдачи нет — выдача
   * прервалась (обрыв связи, перезапуск): её доделывают, а не считают сделанной.
   */
  granted?: boolean;
};

export type CreditDecision =
  /** Закрыть открытый круг этим переводом. */
  | { kind: "close"; cycle: CycleRow }
  /** Номер выезжал мимо учёта: завести неявный круг и закрыть его. */
  | { kind: "implicit"; openedAt: number }
  /** Этот перевод уже зачтён. */
  | { kind: "already"; cycle: CycleRow }
  /** Перевод из круга, который уже закрыт другим вводом. */
  | { kind: "stale"; cycle: CycleRow };

/** Кто позже: по времени выезда, при равенстве — по id (так же сортирует SQL). */
const later = (a: CycleRow, b: CycleRow): boolean =>
  a.openedAt > b.openedAt || (a.openedAt === b.openedAt && a.id > b.id);

/** Круг, открытый не позже момента t (самый поздний из таких). */
export function cycleAt(cycles: CycleRow[], atMs: number): CycleRow | null {
  let best: CycleRow | null = null;
  for (const c of cycles) {
    if (c.openedAt > atMs) continue;
    if (!best || later(c, best)) best = c;
  }
  return best;
}

/**
 * Что делать с переводом txHash на склад в момент atMs.
 *
 * Сравнение с моментом выезда — без форы. Выезд записывается с моментом ДО
 * отправки: пока номер на складе, никто другой ввести его не может, так что
 * раннее время безопасно, а позднее — нет (перевод нового владельца прилип бы
 * к прошлому кругу).
 *
 * Неявный круг — тесный (t − 1 мс), а не «от прошлого ввода до этого»: широкий
 * круг накрывал бы соседний честный перевод из того же промежутка, и догон,
 * разобравший их не по порядку, отказал бы старшему.
 */
export function decideCredit(cycles: CycleRow[], txHash: string, atMs: number): CreditDecision {
  const mine = cycles.find((c) => c.closeTx === txHash);
  if (mine) return { kind: "already", cycle: mine };
  const cur = cycleAt(cycles, atMs);
  if (!cur) return { kind: "implicit", openedAt: atMs - 1 };
  if (cur.closedAt == null) return { kind: "close", cycle: cur };
  if (cur.closedAt < atMs) return { kind: "implicit", openedAt: atMs - 1 };
  return { kind: "stale", cycle: cur };
}

/**
 * Надо ли что-то выдать по этому переводу: новый круг или прерванная выдача
 * этим же переводом (закрыл круг, а выдать не успел).
 */
export function isCreditable(d: CreditDecision): boolean {
  if (d.kind === "close" || d.kind === "implicit") return true;
  return d.kind === "already" && d.cycle.granted === false;
}

/**
 * Начало учёта кругами — выкат, 27.09.2026 23:33 UTC (перенос истории — 21:25,
 * между ними вводы ещё зачитывал прежний код).
 *
 * Переводы раньше этого момента круги знают только такими, какими их нашёл
 * перенос. Если перевод в круги не попал, новая выдача сама его не зачитывает:
 * выдачи того времени частью стёрты крафтом (строки фишек удаляются), и
 * страховке не на что опереться — повтор старого хэша выдал бы второй раз.
 * Такие переводы — разбор руками; всё после границы идёт как обычно.
 */
export const CYCLES_LIVE_MS = Date.parse("2026-09-27T23:33:00Z");
export const beforeCycles = (atMs: number): boolean => atMs < CYCLES_LIVE_MS;

/** Последний по времени выезда круг номера. */
export function latestCycle(cycles: CycleRow[]): CycleRow | null {
  let best: CycleRow | null = null;
  for (const c of cycles) if (!best || later(c, best)) best = c;
  return best;
}

/**
 * Прятать ли NFT из списка «Ввести в игру».
 *
 * Список строится по индексу владения Sendler, а тот отстаёт от перевода на
 * секунды. Сразу после ввода NFT ещё числится за игроком — её надо спрятать,
 * иначе второй тап получит отказ. Критерий честный: мы зачли ввод ПОСЛЕ того,
 * как игрок её получил (holderSinceMs — момент из того же индекса). Если же
 * игрок получил номер после нашего последнего ввода — он снаружи и вводится.
 */
export function hiddenForHolder(cycles: CycleRow[], holderSinceMs: number | null): boolean {
  const last = latestCycle(cycles);
  if (!last || last.closedAt == null) return false;
  if (holderSinceMs == null) return false;
  return last.closedAt >= holderSinceMs;
}

/**
 * Порядок догона: номера со свежим переводом — первыми, внутри номера — от
 * старого перевода к новому. Прогон берёт голову списка, и при общей сортировке
 * по возрастанию старые вечно невыдаваемые переводы (отправитель не игрок, нет
 * связки) занимали всю очередь, а свежий ввод игрока ждал за ними.
 */
export function recoveryOrder<T extends { contract: string; tokenId: string; atMs: number }>(
  list: T[],
): T[] {
  const byToken = new Map<string, T[]>();
  for (const c of list) {
    const k = `${c.contract}|${c.tokenId}`;
    byToken.set(k, [...(byToken.get(k) ?? []), c]);
  }
  const groups = [...byToken.values()].map((g) => g.sort((a, b) => a.atMs - b.atMs));
  groups.sort((a, b) => b[b.length - 1].atMs - a[a.length - 1].atMs);
  return groups.flat();
}

/** Привязка круга, в котором номер сейчас снаружи (для показа «это твоя фишка»). */
export function openBinding(cycles: CycleRow[]): CycleBinding | null {
  const last = latestCycle(cycles);
  if (!last || last.closedAt != null) return null;
  return last.binding;
}
