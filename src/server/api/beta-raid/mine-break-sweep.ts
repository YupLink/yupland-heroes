// Обход поломок шахт v2 (ПРАВИЛА §8.59) и окружения (§8.80, mine-nature-sweep):
// раз в минуту в каждом процессе (как
// decor-respawn и мешочки), стартует с отдачей снимка карты (map-serve).
//
// Работу делает база — raid_mine_break_due: накопленное до поломки (с
// неполным последним часом, дробно) — хозяину строкой «Отбитых шахт» к
// «Забрать», не на счёт (minecap-01); охрана снята навсегда, строка владения
// удалена (шахта ничья). Процессов бывает два: каждая шахта ломается под
// своим локом, второй найдёт ноль. Начисленного сейчас нет (amount 0) —
// «Хозяин шахт» (§8.57) засчитывается при «Забрать» (mine-lost-claim).
// Тем же проходом — тосты и письма о потерях (mine-lost-notify): поломки,
// гниль грибов и всё, что не успел разослать захват.
//
// Рассылка: перед обходом читаем клетки, которые он сломает, с запасом в
// несколько секунд вперёд, и шлём им 'built' (mine) — окно шахты, охрана и
// флажки перечитываются без F5. Лишняя клетка из запаса получит безвредное
// обновление и ещё раз — когда сломается на следующем проходе. Тем же
// проходом досылаются клетки разобранных шахт (§8.70, mine-dismantle-announce) и
// доносится домой экипаж кораблей, взорванных синим динамитом (§8.75а,
// dynamite-crew-home), если не донесло само нажатие.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { breakDueSql, dueCellsSql } from "@/server/api/beta-raid/mine-v2-sql";
import { bumpAchievement } from "@/server/api/achievements/bump";

const EVERY_MS = 60_000;
/** Шахт за один вызов обхода; больше — следующий вызов в том же проходе. */
const BATCH = 100;
/** Сколько вызовов за проход (после перевода все шахты ломаются в одну минуту). */
const MAX_ROUNDS = 10;
const SLACK_SEC = 10;

type DueRow = { map_id: string; q: number | string; r: number | string };
type BrokeRow = { owner: string | null; amount: number | string | null };

/** Клетки «q,r» по картам. */
export function cellsByMap(rows: DueRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    out.set(row.map_id, [...(out.get(row.map_id) ?? []), key]);
  }
  return out;
}

/** Начисленное при поломках — по хозяевам (нули и ничьи — мимо). */
export function creditsByOwner(rows: readonly BrokeRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const n = Number(row.amount) || 0;
    if (!row.owner || !(n > 0)) continue;
    out.set(row.owner, (out.get(row.owner) ?? 0) + n);
  }
  return out;
}

/** Один проход: сломать созревшие и разослать их клетки. Отдаёт, сколько сломано. */
export async function sweepMineBreaks(): Promise<number> {
  let total = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const due = ((await mcpExec(dueCellsSql(BATCH, SLACK_SEC), { wrapJson: true })) ??
      []) as DueRow[];
    if (due.length === 0) break;
    const broke = ((await mcpExec(breakDueSql(BATCH), { wrapJson: true })) ?? []) as BrokeRow[];
    const n = broke.length;
    for (const [mapId, cells] of cellsByMap(due)) {
      publishRaid({ mapId, type: "built", mine: true, owner: true, cells });
    }
    for (const [owner, amount] of creditsByOwner(broke)) {
      bumpAchievement(owner, "minelord", amount);
    }
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepMineBreaks();
  } catch (e) {
    console.warn("[mine-break] обход не удался:", e instanceof Error ? e.message : e);
  }
  try {
    // Окружение лесопилок и каменоломен (§8.80) — после поломок: сломанной уже нечего пересчитывать.
    const { sweepMineNature } = await import("./mine-nature-sweep");
    await sweepMineNature();
  } catch (e) {
    console.warn("[mine-nature] обход не удался:", e instanceof Error ? e.message : e);
  }
  try {
    // Потери шахт и грибов — тост и письмо прежнему хозяину (сбой — только в лог).
    const { runMineLostNotify } = await import("./mine-lost/mine-lost-notify");
    await runMineLostNotify();
    // Разобранные шахты (§8.70), чья клетка не разослалась, — дослать.
    const { resendDismantles } = await import("./mine-dismantle/mine-dismantle-announce");
    await resendDismantles();
  } catch (e) {
    console.warn("[mine-break] досылка разборок:", e instanceof Error ? e.message : e);
  }
  try {
    const { resendCrewsHome } = await import("./dynamite/dynamite-crew-home");
    await resendCrewsHome();
  } catch (e) {
    console.warn("[dynamite] экипаж домой:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить обход в этом процессе: раз в минуту, первый проход — сразу. */
export function startMineBreakSweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
