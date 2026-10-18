// Защита USDT от минуса (ПРАВИЛА §8.49а). USDT — живые деньги на кошельке, их не
// дочеканишь: «Свободно USDT» не уходит ниже нуля ни обменом, ни раскладкой.
//
//   · обмен и раскладка оставляют запас USDT_RESERVE сверх всех обязательств — на
//     депозит, который уже пришёл в сеть, но игрок ещё не нажал «проверить»;
//   · обмен один на все процессы (аренда в settings), «свободно» перепроверяется
//     уже под арендой — два обмена не съедят одно и то же;
//   · сторож (usdt-watch) раз в 10 минут считает «свободно»; минус — сигнал админам.
import { mcpExec } from "../db/mcpClient";
import { freeTokenPool } from "./token-free-pool";

/** Сколько USDT сверх обязательств не трогают ни обмен, ни раскладка. */
export const USDT_RESERVE = 5;

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Сколько USDT можно пустить в дело сейчас (свободно минус запас); null — сеть молчит. */
export async function spendableUsdt(): Promise<number | null> {
  const { free } = await freeTokenPool("USDT");
  return free === null ? null : free - USDT_RESERVE;
}

/**
 * Отказ, если `usdt` не помещается в свободное с запасом. `counted` — часть суммы,
 * которую «свободно» уже вычло (ждущая подтверждения выплата).
 */
export async function assertSpendableUsdt(usdt: number, what: string, counted = 0): Promise<void> {
  const can = await spendableUsdt();
  if (can === null) throw new Error(`Остаток USDT не прочитался — ${what} отложен, попробуй позже`);
  if (usdt > can + counted + 1e-6) {
    throw new Error(
      `Свободно USDT с запасом ${USDT_RESERVE}: ${fmt(Math.max(0, can))} — ${what} на ${fmt(usdt)} нельзя`,
    );
  }
}

/** Взять аренду обмена USDT (5 минут на случай упавшего процесса). */
export async function lockUsdtSwap(): Promise<boolean> {
  const rows = (await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES ('usdt_swap_busy', now()::text)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE yuplink.settings.value::timestamptz < now() - interval '5 minutes'
     RETURNING 1 AS ok;`,
    { wrapJson: false },
  ).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

export async function unlockUsdtSwap(): Promise<void> {
  await mcpExec(`DELETE FROM yuplink.settings WHERE key = 'usdt_swap_busy';`, {
    wrapJson: false,
  }).catch((e) => console.warn("[usdt-guard] аренда обмена не снялась:", e));
}
