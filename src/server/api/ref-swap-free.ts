// Ручной обмен USDT → DARAI берёт только свободный USDT карты — то же
// «Свободно», что над картой, и ещё оставляет запас (usdt-guard): деньги игроков,
// корзины, ставки, незачисленные депозиты, открытые пачки подписки, разложенное по
// карте не трогаем. Пачки подписки меняют свою корзину через ядро (ref-swap-core)
// и сюда не ходят.
import { assertSpendableUsdt } from "./usdt-guard";

export async function assertFreeUsdt(usdtHuman: number): Promise<void> {
  await assertSpendableUsdt(usdtHuman, "обмен");
}
