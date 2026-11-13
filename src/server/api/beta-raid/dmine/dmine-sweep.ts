// Обход грибов (lib/daraiMine): раз в минуту в каждом процессе,
// стартует с отдачей снимка карты (map-serve), как поломки шахт v2.
//
//  • Конец жизни — гриб исчезает из рюкзака и с карты (dmine-expire), заодно
//    свёртка прежних стопок dmine:<id> в одну dmine:darai.
//  • Новый час — появление грибов на жилах (dmine-spawn), одна рассылка на карту.
//  • Час в рюкзаке вышел — мешочка нет: гриб сам встаёт у героя (клетка
//    героя, не годится — ближайшая годная рядом) и работает у того, у кого
//    лежал (dmine-autoplace, ключ на гриб — повтор и второй процесс второй раз
//    не ставят). Ставить некуда или герой на острове — гриб ждёт WAIT_MS
//    (герой мог отойти) и очередь не держит; сбой — RETRY_MS. Героя нет на
//    карте (нет позиции) — строки нет в выборке, гриб лежит до конца жизни.
//  • Неразосланные «Забрать» / «Посадить» — дослать клетку (dmine-announce).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import { DMINE_CARRY_MS } from "@/lib/daraiMine";
import {
  announceDmine,
  dmineOpSweepSql,
  dmineUnsentSql,
  type DmineOpRow,
} from "@/server/api/beta-raid/dmine/dmine-announce";
import { autoPlaceDmine, type DueDmine } from "@/server/api/beta-raid/dmine/dmine-autoplace";
import { expireMushrooms } from "@/server/api/beta-raid/dmine/dmine-expire";
import { spawnMushrooms } from "@/server/api/beta-raid/dmine/dmine-spawn";
import { respawnEatenMushrooms } from "@/server/api/beta-raid/dmine/dmine-respawn";

export type { DueDmine } from "@/server/api/beta-raid/dmine/dmine-autoplace";

const EVERY_MS = 60_000;
/** Грибов за проход; больше — следующим. */
const BATCH = 50;
/** Ставить было некуда — пробуем снова через столько. */
const WAIT_MS = 2 * 60_000;
/** Сбой базы на строке — столько ждём, пропуская вперёд остальные. */
const RETRY_MS = 10 * 60_000;
/** Больше отложенных не помним — список в SQL не раздувается. */
const SKIP_MAX = 500;
/** Отложенные грибы: id → с какой минуты пробовать снова (мс). */
const skipped = new Map<string, number>();

/**
 * Грибы, чей час в рюкзаке вышел (живые), с позицией аккаунта (без неё — не
 * берём), кроме отложенных. Кошелёк — поднявшего (taken_wallet), иначе — позиции.
 */
export const dueDminesSql = (skip: readonly string[] = []): string =>
  `SELECT d.id, d.hero_id, d.taken_by AS account_id, d.mushroom,
          COALESCE(d.taken_wallet, p.wallet) AS wallet,
          ${POS_MAP_SQL("p")} AS map_id, p.q, p.r
     FROM yuplink.raid_dmine d
     JOIN yuplink.beta_raid_positions p ON p.account_id = d.taken_by
    WHERE d.state = 'item' AND d.hero_id IS NOT NULL
      AND d.taken_at <= now() - interval '${Math.round(DMINE_CARRY_MS / 1000)} seconds'
      AND (d.dies_at IS NULL OR d.dies_at > now())
      ${skip.length ? `AND d.id NOT IN (${skip.map(sqlStr).join(", ")})` : ""}
    ORDER BY d.taken_at
    LIMIT ${BATCH}`;

/** Отложенные сейчас (срок вышел — забываем). */
function skipNow(now: number): string[] {
  for (const [id, at] of skipped) if (at <= now) skipped.delete(id);
  return [...skipped.keys()];
}

/** Отложить строку на wait мс. */
function skipRow(id: string, until: number): void {
  if (skipped.size < SKIP_MAX) skipped.set(id, until);
}

/** Для тестов: забыть отложенные. */
export const resetDmineSkips = (): void => skipped.clear();

/** Один проход: конец жизни, посадить просроченные, дослать неразосланные. Отдаёт, сколько встало. */
export async function sweepDaraiMines(): Promise<number> {
  await expireMushrooms().catch((e: unknown) =>
    console.warn("[dmine] конец жизни:", e instanceof Error ? e.message : e),
  );
  // Раз в час — появление на жилах (ключ часа в базе: второй процесс не бросает).
  await spawnMushrooms().catch((e: unknown) =>
    console.warn("[dmine] появление грибов:", e instanceof Error ? e.message : e),
  );
  // Съеденные (§8.85): через 12 ч — бросок 50 %, выпало — на свободную жилу.
  await respawnEatenMushrooms().catch((e: unknown) =>
    console.warn("[dmine] возврат съеденных:", e instanceof Error ? e.message : e),
  );
  let placed = 0;
  const now = Date.now();
  const sql = dueDminesSql(skipNow(now));
  const due = ((await mcpExec(sql, { wrapJson: true })) ?? []) as DueDmine[];
  for (const d of due) {
    try {
      const res = await autoPlaceDmine(d);
      if (res === "placed") placed += 1;
      // Некуда — скоро снова; предмета уже нет, а строка висит — нескоро.
      else skipRow(d.id, now + (res === "none" ? WAIT_MS : RETRY_MS));
    } catch (e) {
      skipRow(d.id, now + RETRY_MS);
      console.warn("[dmine] гриб не встал:", d.id, e instanceof Error ? e.message : e);
    }
  }
  const unsent = ((await mcpExec(dmineUnsentSql(), { wrapJson: true })) ?? []) as DmineOpRow[];
  for (const row of unsent) await announceDmine(row);
  await mcpExec(dmineOpSweepSql()).catch(() => {});
  return placed;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepDaraiMines();
  } catch (e) {
    console.warn("[dmine] обход не удался:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить обход в этом процессе: раз в минуту, первый проход — сразу. */
export function startDaraiMineSweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
