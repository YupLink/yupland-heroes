// Прошёл ли аккаунт Прихожую. Одна на Telegram, а не на кошелёк.
//
// Юпик заводится на том кошельке, которым игрок вошёл впервые. Подключит он
// потом второй кош — по нему записи нет, и проверка «есть ли released у ЭТОГО
// кошелька» отправляла давно выпущенного игрока обратно на порог (замер
// 04.09.2026: один такой висел).
import { pg } from "../db/pg";

export async function hallwayReleased(wallet: string, telegramId: number | null): Promise<boolean> {
  const own = await pg.hallwayYupiks.findOne({ wallet }).catch(() => null);
  if (own?.released) return true;
  if (telegramId == null) return !!own?.released;
  const { data } = await pg.hallwayYupiks
    .raw()
    .select("released")
    .eq("telegram_id", telegramId)
    .limit(20);
  return ((data ?? []) as Array<{ released: boolean }>).some((r) => r.released);
}
