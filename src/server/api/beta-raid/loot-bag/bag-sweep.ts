// Сборщик мешочков: раз в минуту в каждом процессе (как decor-respawn).
//
//  • Сгоревшие порции (24 часа с попадания в мешочек, у бугорка — с
//    закапывания; ПРАВИЛА §8.21) и опустевшие уходят, мешочек без порций — через
//    10 минут тишины. Проход под общим локом отдельным оператором: второй
//    процесс видит уже убранное. Игрокам рядом с убранным — событие 'bags'
//    (окно и слой и так гасят сгоревшее по своему таймеру; событие — для тех,
//    чей ответ старше).
//  • Зависшие снятия (штуки сняты с мешочка, а выдача в рюкзак не отчиталась:
//    сбой базы, упавший процесс) развязываются «забором» выдачи (backSql):
//    не было — штуки назад в мешочек, была — ключ закрыт. Ничего не теряется
//    и не удваивается.
//
// Стартует с отдачей снимка карты (map-serve) и с первым выпавшим мешочком.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sweepSql } from "@/server/api/beta-raid/loot-bag/bag-read-sql";
import { backSql, staleTakesSql } from "@/server/api/beta-raid/loot-bag/bag-back-sql";

const EVERY_MS = 60_000;

type GoneRow = { map_id: string; q: number | string; r: number | string };

/** Строки ответа, который сам собирает row_to_json: мост отдаёт `_row` и строкой. */
function rowsOf<T>(rows: unknown[] | null | undefined): T[] {
  const out: T[] = [];
  for (const raw of rows ?? []) {
    const inner =
      raw && typeof raw === "object" && "_row" in raw ? (raw as { _row: unknown })._row : raw;
    try {
      const row = typeof inner === "string" ? (JSON.parse(inner) as T) : (inner as T);
      if (row) out.push(row);
    } catch {
      /* битая строка — пропускаем */
    }
  }
  return out;
}

/** Развязать зависшие снятия; вернулось в мешочек — событие его клетке. */
async function settleStale(): Promise<number> {
  const stale = (await mcpExec(staleTakesSql(), { wrapJson: true })) as Array<{
    op: string;
    bagId: string;
    heroId: string;
    q: number | null;
    r: number | null;
    mapId: string | null;
  }>;
  let n = 0;
  for (const s of stale ?? []) {
    try {
      const sql = backSql({ bagId: s.bagId, heroId: s.heroId, op: s.op, nonce: s.op });
      const [res] = rowsOf<{ back: boolean }>((await mcpExec(sql)) as unknown[]);
      if (res?.back && s.q != null && s.r != null) {
        publishRaid({ mapId: s.mapId, type: "bags", cells: [`${Number(s.q)},${Number(s.r)}`] });
      }
      n++;
    } catch (e) {
      console.warn("[loot-bag] снятие не развязано:", s.op, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/** Один проход: развязать зависшие, убрать сгоревшее и пустое, разослать клетки. */
export async function sweepLootBags(): Promise<number> {
  await settleStale().catch((e) =>
    console.warn("[loot-bag] зависшие снятия:", e instanceof Error ? e.message : e),
  );
  const gone = rowsOf<GoneRow>((await mcpExec(sweepSql())) as unknown[]);
  for (const row of gone) {
    publishRaid({ mapId: row.map_id, type: "bags", cells: [`${Number(row.q)},${Number(row.r)}`] });
  }
  return gone.length;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepLootBags();
  } catch (e) {
    console.warn("[loot-bag] сборщик не прошёл:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить сборщик в этом процессе: раз в минуту, первый проход — сразу. */
export function startLootBagSweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
