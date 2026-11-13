// Обход клада раз в 5 минут (lib/treasure). Процессов несколько — проход берёт
// аренду в settings (как «Вестник»), сами шаги защищены ключами базы.
//   1. живой клад старше суток — «исчез», клетка снова обычная;
//   2. найденный клад без строки в «Добыче»/без писем, забранный и не выданный —
//      довести (treasure-harvest);
//   3. фото админам, которое не дошло, — ещё раз;
//   4. настал слот дня (09:00 МСК), клада слота нет — закопать.
import { mcpExec } from "@/server/db/mcpClient";
import { treasureHarvestPass } from "./treasure-harvest";
import { notifyPlaced, placeIfDue } from "./treasure-place";

const EVERY_MS = 5 * 60_000;

const lease = `INSERT INTO yuplink.settings (key, value) VALUES ('treasure_pass', now()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
   WHERE yuplink.settings.value::timestamptz < now() - interval '4 minutes'
  RETURNING 1 AS ok`;

async function list(sql: string, cte = false): Promise<Array<Record<string, unknown>>> {
  const r = (await mcpExec(sql, cte ? { wrapJsonCte: true } : { wrapJson: true })) as unknown[];
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

/** Один проход. */
export async function treasurePass(now: number = Date.now()): Promise<void> {
  if ((await list(lease, true).catch(() => [])).length === 0) return;
  await mcpExec(
    `UPDATE yuplink.raid_treasure SET status = 'expired'
      WHERE status = 'live' AND expires_at <= now();`,
  );
  await treasureHarvestPass().catch(() => {});
  for (const x of await list(
    `SELECT id FROM yuplink.raid_treasure
      WHERE notified_at IS NULL AND shot IS NOT NULL AND placed_at > now() - interval '1 day'
      ORDER BY placed_at LIMIT 3;`,
  )) {
    await notifyPlaced(String(x.id)).catch(() => {});
  }
  await placeIfDue(now);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Включить обход в этом процессе; зовёт отдача карты (map-serve), как «Вестник». */
export function startTreasure(): void {
  if (timer || typeof setInterval !== "function") return;
  if (!import.meta.env.SSR) return;
  const run = () =>
    void treasurePass().catch((e) =>
      console.warn("[treasure] проход не удался:", e instanceof Error ? e.message : e),
    );
  timer = setInterval(run, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  run();
}
