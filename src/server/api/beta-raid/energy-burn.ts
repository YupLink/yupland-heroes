// Выжигание энергии игрока способностью цели: списать НЕ БОЛЬШЕ, чем есть.
//
// Вынесено из encounter-effects.ts, когда тот перерос лимит на размер файла
// (§13.1): выжигание — единственная побочка, которая не хранится строкой
// эффекта, а сразу трогает счёт энергии.

/** Энергия дробная (numeric) — режем до сотых, как это делает сама SQL-функция. */
const toEnergy = (n: number): number => Math.floor(Math.max(0, n) * 100) / 100;

/** Из «not_enough_energy:12.5:30» достаём остаток игрока (первое число). */
function energyLeft(message: string): number | null {
  const m = /not_enough_energy:(-?[0-9]+(?:\.[0-9]+)?)/.exec(message);
  return m ? Math.max(0, Number(m[1])) : null;
}

/**
 * Выжигание энергии: списываем НЕ БОЛЬШЕ, чем у игрока есть, и возвращаем
 * фактически списанное.
 *
 * SQL-функция работает по принципу «всё или ничего»: при нехватке она не
 * спишет НИЧЕГО и сообщит остаток. Раньше здесь это читалось как «спишем
 * сколько получится», а наверх возвращалась запрошенная сумма — игрок видел
 * списание, которого не было. Теперь на отказе повторяем ровно с остатком:
 * игрок выгорает до нуля, но никогда в минус. Тем же повтором лечится гонка,
 * когда параллельный шаг съел энергию между попытками.
 */
export async function burnEnergy(wallet: string, amount: number): Promise<number> {
  if (!(amount > 0)) return 0;
  let spend = toEnergy(amount);
  try {
    const { sb } = await import("../../db/pg");
    for (let attempt = 0; attempt < 3 && spend > 0; attempt++) {
      const { error } = await sb.rpc("touch_energy_atomic", { p_wallet: wallet, p_spend: spend });
      if (!error) {
        // Выжгла способность цели — для игрока это цена боя.
        const { noteEnergySpendByWallet } = await import("./econ/energy-note");
        void noteEnergySpendByWallet(wallet, spend, "fight");
        return spend;
      }
      const left = energyLeft(String(error.message));
      if (left === null) {
        console.warn("[beta-abilities] burn energy failed:", error.message);
        return 0;
      }
      // Остаток всегда меньше запрошенного — повтор не зациклится.
      spend = toEnergy(Math.min(spend, left));
    }
  } catch (e) {
    // Не только «мало энергии» приходит ошибкой: потерянный пул (ПРАВИЛА про
    // «pool is closed») летит ИСКЛЮЧЕНИЕМ. А зовут нас уже ПОСЛЕ списания
    // энергии за вход в бой и ДО нанесения урона — вылети мы наружу, игрок
    // заплатил бы и не ударил. Способность просто не сработала.
    console.warn("[beta-abilities] burn energy crashed:", e instanceof Error ? e.message : e);
    return 0;
  }
  // Жечь нечего — это не повод валить бой.
  return 0;
}
