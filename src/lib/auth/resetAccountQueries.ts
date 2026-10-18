// Сброс кэша при входе под другим аккаунтом (TG-логин в NearConnectorBridge).
//
// Чужие данные выбрасывать надо, но так, чтобы экран, который их уже ждёт,
// получил свежие. Раньше здесь был removeQueries: он вынимал запрос из кэша,
// начатый ДО входа запрос отменялся молча, а следующий invalidateQueries новый
// не запускал — в кэше запроса больше нет, а подписчик держит удалённый. Экран
// оставался «загружается» навсегда.
//
// resetQueries выбрасывает так же — данные к начальному состоянию, ответ под
// прежней кукой отменён и не ляжет, — но запрос остаётся в кэше и сразу
// перезапрашивается для всех, кто на него подписан.
import type { QueryClient } from "@tanstack/react-query";

/** Что принадлежит аккаунту целиком и не должно пережить его смену. */
export const ACCOUNT_QUERY_KEYS = [["session"], ["hallway-state"]] as const;

export async function resetAccountQueries(qc: QueryClient): Promise<void> {
  await Promise.all(ACCOUNT_QUERY_KEYS.map((queryKey) => qc.resetQueries({ queryKey })));
}
