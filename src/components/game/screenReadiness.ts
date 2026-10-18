type QueryState<T> = { data?: T; isError: boolean };

/**
 * Unknown identity must never briefly select the classic interface.
 * Нет входа — «guest» (вход через Telegram), а не старая страница с «Подключи кошелёк»:
 * игрок = аккаунт на Telegram (17.10). Пока идёт вход по Telegram — заставка.
 */
export function entryScreen(
  mounted: boolean,
  classic: boolean,
  session: QueryState<{ wallet?: unknown }>,
  tgPending = false,
) {
  if (!mounted || !session.data) return mounted && session.isError ? "error" : "loading";
  // Вход по Telegram идёт — ждём его, даже если кука уже есть: на общем устройстве она
  // может быть от прошлого аккаунта, и замок не должен открыться под чужим.
  if (tgPending) return "loading";
  if (!session.data.wallet) return "guest";
  return classic ? "classic" : "castle";
}

/** Keep an already loaded map during background failures; distinguish no map from no response. */
export function raidScreen(
  map: QueryState<{ map: unknown }>,
  player: QueryState<unknown>,
  hasStore: boolean,
) {
  if (map.data?.map && hasStore && player.data) return "ready";
  if ((!map.data && map.isError) || (!player.data && player.isError)) return "error";
  if (map.data && !map.data.map) return "empty";
  return "loading";
}
