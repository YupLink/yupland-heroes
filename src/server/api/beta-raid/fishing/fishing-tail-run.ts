// Досчёт «Улова» на финише — чтение забросов участников и запись очков (расчёт
// и SQL — fishing-tail). Зовёт finishTournament для категории fish_catch, после
// захвата выплаты и до мест. Строки — одним чтением; удочки в руках и «видели»
// — только у забросов, где созревшее до конца ещё не отыграно.
import { mcpExec } from "@/server/db/mcpClient";
import { effectiveMain, pickMain } from "@/lib/raid/mainTool";
import { loadToolState } from "@/server/api/beta-raid/main-tool/main-tool-read";
import { loadFishingConfig } from "@/server/api/beta-raid/fishing/fishing-config";
import { rodTriesIn } from "@/server/api/beta-raid/fishing/fishing-plan";
import { fishHorizon, parseFishRow } from "@/server/api/beta-raid/fishing/fishing-row";
import { touchSql, type FishRow } from "@/server/api/beta-raid/fishing/fishing-sql";
import {
  castHits,
  tailPointsSql,
  tailRowsSql,
  type CastHit,
} from "@/server/api/beta-raid/fishing/fishing-tail";

/** Попытки удочек героя, если удочка в руках (как у досчёта); иначе ноль. */
async function rodTriesInHand(heroId: string): Promise<number> {
  const st = await loadToolState(heroId);
  const pick = pickMain(effectiveMain(st.stored, st.stacks), st.stacks, { kind: "rod" });
  return pick.ok ? rodTriesIn(st.stacks) : 0;
}

/**
 * Досчитать очками клюнувшее до конца турнира, но не легшее к финишу. Ответ —
 * сколько поимок внутри турнира ушло на сверку (остаток засчитает SQL). Сбой
 * базы — бросок: финиш не идёт дальше, тикер доделает его повтором (поздняя
 * выдача тем временем ложится сама — мест ещё нет).
 */
export async function settleFishTail(t: {
  id: string;
  metric: string;
  startedMs?: number | null;
  endsMs: number | null;
}): Promise<number> {
  if (t.metric !== "fish_catch" || t.endsMs == null) return 0;
  const cfg = await loadFishingConfig();
  if (cfg.items.length === 0) return 0;
  const rows = ((await mcpExec(tailRowsSql(t.id), { wrapJson: true })) ?? []) as Array<
    FishRow & { account?: unknown }
  >;
  const hits: CastHit[] = [];
  for (const raw of rows) {
    const account = typeof raw.account === "string" ? raw.account : "";
    if (!account) continue;
    const row = parseFishRow(raw);
    // Созревшее до конца ещё не отыграно — досчёт впереди.
    const ahead = !row.stopped && row.tries < row.planTries && row.nextMs < t.endsMs;
    const rodTries = ahead ? await rodTriesInHand(row.heroId) : 0;
    const startMs = t.startedMs ?? Number.NEGATIVE_INFINITY;
    hits.push(...castHits({ account, row, cfg, startMs, endsMs: t.endsMs, rodTries }));
    // Герой на месте в миг финиша — «видели» сюда, как при чтении заброса: сойдёт
    // с клетки до выдачи — досчёт всё равно отдаст клюнувшее до финиша, и очки
    // не разойдутся с рыбой.
    if (ahead && fishHorizon(row).end === null)
      await mcpExec(touchSql(account, row.op, row.nowMs)).catch(() => []);
  }
  if (hits.length > 0) await mcpExec(tailPointsSql(t.id, hits));
  return hits.length;
}
