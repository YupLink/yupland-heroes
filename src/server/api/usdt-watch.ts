// Сторож «Свободно USDT» (ПРАВИЛА §8.49а): раз в 10 минут считает то же число, что
// над картой; ушло ниже нуля — сигнал админам в Telegram, не чаще раза в час, пока
// минус держится. Обмен и раскладка USDT при минусе стоят сами (usdt-guard).
// Один процесс на все: аренда в settings, как у сборщиков карты.
import { mcpExec } from "../db/mcpClient";
import { sendTgMessageToAdmins } from "../tg";
import { freeTokenPool } from "./token-free-pool";

const EVERY_MS = 10 * 60_000;

const lease = (key: string, every: string) =>
  `INSERT INTO yuplink.settings (key, value) VALUES ('${key}', now()::text)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    WHERE yuplink.settings.value::timestamptz < now() - interval '${every}'
   RETURNING 1 AS ok;`;

async function took(key: string, every: string): Promise<boolean> {
  const rows = (await mcpExec(lease(key, every), { wrapJson: false }).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Один проход: посчитать и, если минус, сказать админам. Отдаёт «свободно». */
export async function usdtWatchPass(): Promise<number | null> {
  if (!(await took("usdt_watch_pass", "9 minutes"))) return null;
  const p = await freeTokenPool("USDT");
  if (p.free === null || p.free >= 0) return p.free;
  if (!(await took("usdt_watch_alerted", "1 hour"))) return p.free;
  const owed = p.playerBalances + p.queuedRewards + p.onMap + p.payoutsPending;
  await sendTgMessageToAdmins(
    `🔴 «Свободно USDT» в минусе: ${fmt(p.free)}\n` +
      `Кошелёк ${fmt(p.walletBalance ?? 0)} · игрокам ${fmt(owed)} · ` +
      `копилки, ставки, подарки ${fmt(p.reserved)}\n` +
      `Обмен и раскладка USDT стоят, пока не выровняется.`,
  ).catch((e) => console.warn("[usdt-watch] сигнал не ушёл:", e));
  return p.free;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Включить сторожа в этом процессе; зовёт отдача карты (map-serve). */
export function startUsdtWatch(): void {
  if (timer || typeof setInterval !== "function") return;
  if (!import.meta.env.SSR) return;
  const pass = () =>
    void usdtWatchPass().catch((e) =>
      console.warn("[usdt-watch] проход не удался:", e instanceof Error ? e.message : e),
    );
  timer = setInterval(pass, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  pass();
}
