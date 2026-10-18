// «Забвение» по часам СЕРВЕРА (владелец, 28.09): часы телефона бывают сбиты, и
// у отстающих «Забыть» висела после конца эффекта — сервер уже отказывал.
//
// Ответ getMyOblivion несёт serverNow, а запрос при получении ставит свою метку
// clientAt (середина запроса). Их разница — насколько часы телефона ушли от
// сервера. Сроки переводим в часы телефона: дальше книга (active), значок над
// героем (buildEffectGroups) и таймер пропадания сравнивают их с обычным
// Date.now() и гаснут ровно тогда, когда эффект снял сервер.
//
// Та же поправка, что в TicketsPanel (serverNow), только сдвиг берётся в
// момент ответа, а не при отрисовке: ответ лежит в кэше, и «Date.now() −
// serverNow» через минуту — уже возраст ответа, а не расхождение часов.
import { oblivionStateOf, type OblivionState } from "./boostOblivion";

/** Метки часов рядом с ответом: serverNow — от сервера, clientAt — наша. */
type Stamps = { serverNow?: unknown; clientAt?: unknown };

/** На сколько часы телефона впереди сервера, мс (отстают — минус). Нет меток — 0. */
export function oblivionSkewMs(raw: unknown): number {
  const o: Stamps = raw && typeof raw === "object" ? (raw as Stamps) : {};
  const server = Number(o.serverNow);
  const client = Number(o.clientAt);
  if (!(server > 0) || !(client > 0) || !Number.isFinite(server) || !Number.isFinite(client)) {
    return 0;
  }
  return client - server;
}

const shift = (at: string | null, ms: number): string | null =>
  at && ms !== 0 ? new Date(Date.parse(at) + ms).toISOString() : at;

/**
 * Состояние со сроками в часах телефона: сравнивать с Date.now() можно как
 * есть. Ответ старой сборки (без serverNow) остаётся как был.
 */
export function oblivionOnDevice(raw: unknown): OblivionState {
  const state = oblivionStateOf(raw);
  const ms = oblivionSkewMs(raw);
  return { ...state, until: shift(state.until, ms), timedUntil: shift(state.timedUntil, ms) };
}

/** Ответ сервера + наша метка получения: середина запроса. */
export function stampOblivion<T extends object>(
  reply: T,
  sentAt: number,
  gotAt: number,
): T & { clientAt: number } {
  return { ...reply, clientAt: Math.round((sentAt + gotAt) / 2) };
}
