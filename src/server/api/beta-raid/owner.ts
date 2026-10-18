// Кто «владеет» прогрессом на карте — аккаунт, и только он.
//
// Туман, корабли, следы использования построек общие для всех адресов игрока —
// иначе вход с другого кошелька выглядел бы как чужой игрок. Раньше здесь был
// запасной путь «взять первый кошелёк по алфавиту», когда учётки ещё не было;
// он и порождал строки с адресом в колонке владельца, которые превращались в
// сирот, стоило игроку завести аккаунт. Аккаунт есть у каждого входа
// (ПРАВИЛА.md, «Игрок = аккаунт»), поэтому запасного пути больше нет.
//
// Кэш на 30 секунд: ответ спрашивают по 4–6 раз на один шаг или бой, а связка
// «кошелёк → аккаунт» меняется только при привязке кошелька — тогда её
// сбрасывают явно (invalidateOwner).
import { accountOf } from "../user";

const TTL_MS = 30_000;
const cache = new Map<string, { account: string; at: number }>();

export async function raidOwner(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.account;
  const account = await accountOf(key);
  cache.set(key, { account, at: Date.now() });
  if (cache.size > 5000) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }
  return account;
}

/** Кошелёк привязали/отвязали — прежний ответ больше не годится. */
export function invalidateOwner(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
