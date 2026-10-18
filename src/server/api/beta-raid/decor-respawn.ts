// Респавн декора (владелец, 28.09.2026): у шаблона с «Взаимодействием» задано
// «Респавн, мин» — срубленный декор через N минут встаёт на ту же клетку.
//
// Рубка кладёт строку в raid_decor_respawn (миграция decor-02-respawn): что
// вернуть, куда, когда — и клетку в момент рубки. Сборщик раз в минуту (в
// каждом процессе, как dead-sweep) разбирает созревшие одним оператором
// (decor-respawn-sql.ts):
//   • клетку поменял админ — другая местность, дорога, постройка, блок, новый
//     объект, или декор уже стоит; клетки нет; шаблон декора удалён — строка
//     снимается, возврат ничего не перетирает;
//   • на клетке игрок (его лагерь), корабль, беглец или стоящий сундук —
//     ждём: срок сдвигается на минуту, и ждущие не занимают голову очереди
//     навсегда. Мешочек и бугорок (закопанные мешочек и сундуки) не держат:
//     декор встаёт поверх и перекрывает их до рубки (дополнение №5, 29.09) —
//     сами они никуда не деваются, сроки порций дерево не меняет;
//   • иначе декор встаёт (CAS «декора на клетке нет»), строка получает
//     placed_at тем же оператором.
// Процессов бывает два: разбор идёт под общим локом ОТДЕЛЬНЫМ оператором, и
// второй видит уже разобранное — дважды декор не встанет.
//
// Рассылка — отдельным шагом и по базе, а не по ответу оператора: вставшие
// (placed_at) читаются вместе с клеткой как она есть, уходят через
// recordMapChange (журнал + снимок + NOTIFY), и только потом строка удаляется.
// Потерянный ответ моста или упавшая рассылка не оставят «невидимой стены» —
// следующий проход дошлёт; повторная рассылка той же клетки безвредна.
// Проходимость сервер читает из клетки живьём (step-facts): декор встал — шаг
// на клетку «нельзя» сразу.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { recordMapChange } from "@/server/api/beta-raid/map-journal";
import { publishRaid } from "@/server/raidLive";
import {
  placedSql,
  scheduleSql,
  sentSql,
  sweepSql,
  type PlacedRow,
  type RespawnAt,
} from "@/server/api/beta-raid/decor-respawn-sql";
import type { CellPatch } from "@/lib/raid/mapDelta";

export { placedSql, scheduleSql, sentSql, sweepSql };

const EVERY_MS = 60_000;

/** Словарь для клиентов, у которых этого декора ещё нет (как у кисти админа). */
async function decorAssets(ids: string[]): Promise<{ decorations: Record<string, unknown> }> {
  const rows = (await mcpExec(
    `SELECT id, name, image_url FROM yuplink.mystic_item_template
      WHERE id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; image_url: string | null }>;
  const decorations: Record<string, unknown> = {};
  for (const d of rows ?? []) {
    decorations[d.id] = { id: d.id, name: d.name, imageUrl: d.image_url };
  }
  return { decorations };
}

/** Записать дельту клеток с декором (и словарь для новых id). */
async function publish(mapId: string, patches: CellPatch[]): Promise<void> {
  const ids = [...new Set(patches.map((p) => p.decorationId).filter((id): id is string => !!id))];
  await recordMapChange(mapId, { patches }, ids.length ? () => decorAssets(ids) : undefined);
}

const cellKey = (p: { q: number; r: number }) => `${Number(p.q)},${Number(p.r)}`;

/** Декор этих клеток — как он сейчас в базе: «q,r» → id или null. */
async function decorNow(mapId: string, patches: CellPatch[]): Promise<Map<string, string | null>> {
  const list = patches.map((p) => `(${Number(p.q)}, ${Number(p.r)})`).join(", ");
  const rows = (await mcpExec(
    `SELECT q, r, decoration_id FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)} AND (q, r) IN (${list});`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; decoration_id: string | null }>;
  return new Map((rows ?? []).map((x) => [cellKey(x), x.decoration_id ?? null]));
}

/** Разослать вставших по картам. Сбой карты — её строки ждут следующего прохода. */
async function publishPlaced(): Promise<number> {
  const rows = ((await mcpExec(placedSql(), { wrapJson: true })) ?? []) as PlacedRow[];
  const byMap = new Map<string, PlacedRow[]>();
  for (const row of rows) byMap.set(row.map_id, [...(byMap.get(row.map_id) ?? []), row]);
  let sent = 0;
  for (const [mapId, list] of byMap) {
    const patches: CellPatch[] = list
      .filter((x) => x.here)
      .map((x) => ({ q: Number(x.q), r: Number(x.r), decorationId: x.decoration_id ?? null }));
    try {
      if (patches.length > 0) await publish(mapId, patches);
      await mcpExec(sentSql(list));
      sent += patches.length;
      // Декор встал поверх мешочка или бугорка — у игроков рядом слой мешочков
      // перечитывается (событие — по клетке: адресное, только тем, кто рядом).
      for (const x of list) {
        if (x.here && x.covered === true && x.decoration_id) {
          publishRaid({ mapId, type: "bags", cells: [cellKey(x)] });
        }
      }
    } catch (e) {
      console.warn("[decor-respawn] рассылка не прошла:", e instanceof Error ? e.message : e);
      continue;
    }
    // Клетку прочли ДО сдвига версии: если её успели изменить (рубка, кисть) и
    // их дельта ушла раньше нашей, наша устарела. Сверяем после и досылаем
    // правду поверх — иначе у игроков остался бы призрак декора.
    const now = await decorNow(mapId, patches).catch(() => new Map<string, string | null>());
    const fix = patches
      .filter((p) => now.has(cellKey(p)) && now.get(cellKey(p)) !== p.decorationId)
      .map((p) => ({ q: p.q, r: p.r, decorationId: now.get(cellKey(p)) ?? null }));
    if (fix.length > 0) await publish(mapId, fix).catch(() => {});
  }
  return sent;
}

/**
 * Один проход: поставить созревшее и разослать вставшее (в том числе
 * недосланное прошлыми проходами). Отдаёт, сколько клеток ушло игрокам. Разбор
 * упал (или его ответ потерялся) — вставшее всё равно рассылается: что встало,
 * видно по placed_at, а не по ответу.
 */
export async function sweepDecorRespawns(): Promise<number> {
  await mcpExec(sweepSql()).catch((e) =>
    console.warn("[decor-respawn] разбор не прошёл:", e instanceof Error ? e.message : e),
  );
  return publishPlaced();
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepDecorRespawns();
  } catch (e) {
    console.warn("[decor-respawn] проход не удался:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/**
 * Включить сборщик в этом процессе: раз в минуту, первый проход — сразу
 * (свежеподнятый воркер не ждёт минуту). Зовут снимок карты и рубка; таймер
 * процесс не держит.
 */
export function startDecorRespawner(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}

/** Рубка состоялась — поставить возврат. Сбой очереди рубку не отменяет. */
export async function scheduleDecorRespawn(o: RespawnAt): Promise<void> {
  try {
    await mcpExec(scheduleSql(o));
  } catch (e) {
    console.warn("[decor-respawn] возврат не поставлен:", e instanceof Error ? e.message : e);
  }
  startDecorRespawner();
}
