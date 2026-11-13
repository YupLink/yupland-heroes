// Автораздача по карте: предпросмотр и выполнение. Только для админа.
//
// Одна кнопка вместо часа возни кистью: убитых снять, вместо них поставить
// новых в случайные свободные клетки, каждого на свою местность, и раздать
// наградные фонды по формуле.
//
// Ручки две и обе принимают ОДИН И ТОТ ЖЕ план. Предпросмотр не пишет ни
// строки: он проходит тот же путь, только вместо записи считает, что получилось
// бы. Совпадать до объекта они не обязаны (клетки и номиналы разыгрываются
// заново), но итоги — фонды, число объектов, недостача клеток — сойдутся.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../../auth";
import { godMapId } from "./god-map";
import { pickCells, type CellRef } from "./scatter-cells";
import { ensureGroupColumns } from "./map-groups-schema";
import { removeKilled, placeObjects, afterScatter, type Placement } from "./scatter-apply";
import { buildScatter, type ScatterDraft, type GroupBuild } from "./scatter-build";
import { assertScatterUsdt, fundCover, readFreeFunds } from "./scatter-funds";
import { tallyResources, countKilled } from "./scatter-report";
import { parseScatterPlan } from "./scatter-schema";
import { buckets } from "./scatter-buckets";
import {
  GROUP_LABEL,
  type ScatterPlan,
  type ScatterGroup,
  type ScatterGroupReport,
  type ScatterReport,
} from "@/lib/raid/scatterPlan";

/**
 * Итог по группе до записи: кому какая клетка досталась и чего не хватило.
 * `short` — заявок, которым клетки не нашлось вовсе; недостача записи (клетку
 * перехватили) считается уже после неё и с этой не смешивается.
 */
type Slot = {
  placements: Placement[];
  drafts: ScatterDraft[];
  offLand: number;
  short: number;
};

const emptySlot = (): Slot => ({ placements: [], drafts: [], offLand: 0, short: 0 });

const cellKey = (c: CellRef): string => `${c.q},${c.r}`;

/** Разыграть клетки ОДНИМ заходом на все группы — иначе два захода выдали бы
 *  одну и ту же клетку дважды, и второй объект затёр бы первого. */
async function assign(
  mapId: string,
  builds: GroupBuild[],
  seed: number | null,
): Promise<Map<ScatterGroup, Slot>> {
  const slots = new Map<ScatterGroup, Slot>();
  for (const b of builds) slots.set(b.group, emptySlot());

  // Заявки — по группе, местности и «моб ли» (scatter-buckets).
  const list = await buckets(builds);
  // FREE_CELL смотрит на group_id (члены блоков — не свободная земля).
  await ensureGroupColumns();
  const grants = await pickCells(
    mapId,
    // Местность шаблона вне уровня местности — не заявка на неё, а «любая из
    // разрешённых»: иначе босс встал бы на землю не того уровня.
    list.map((b) => ({
      terrainId: b.terrainId && (!b.terrains || b.terrains.includes(b.terrainId)) ? b.terrainId : null,
      count: b.drafts.length,
      terrains: b.terrains,
      // Боссы и убегающие существа — ни на дорогу, ни на жилу (mob-ground).
      mob: b.mob,
    })),
    seed,
  );

  list.forEach((bucket, i) => {
    const slot = slots.get(bucket.group);
    const grant = grants[i];
    if (!slot || !grant) return;
    grant.cells.forEach((cell, k) => {
      const d = bucket.drafts[k];
      if (!d) return;
      slot.drafts.push(d);
      slot.placements.push({
        q: cell.q,
        r: cell.r,
        objectId: d.objectId,
        objectConfig: d.objectConfig,
      });
    });
    slot.offLand += grant.fallback;
    slot.short += grant.short;
  });
  return slots;
}

/** Какая часть плана отвечает за группу — снимать ли убитых. */
function section(plan: ScatterPlan, group: ScatterGroup) {
  if (group === "boss") return plan.boss;
  if (group === "chest") return plan.chests;
  if (group === "coin") return plan.coins;
  return plan.artifacts;
}

/**
 * Заготовки, которые ДЕЙСТВИТЕЛЬНО встали, — по клеткам, вернувшимся с записи.
 *
 * Заготовка и её клетка лежат под одним индексом, поэтому сверяемся по клетке,
 * а не по счётчику: перехватить могли любую из пачки, и «первые N заготовок»
 * посчитали бы на карту деньги объектов, которых там нет. Ключ из набора
 * вычёркивается — одна клетка кормит ровно один объект.
 */
function placedDrafts(slot: Slot, cells: CellRef[]): ScatterDraft[] {
  const left = new Set(cells.map(cellKey));
  return slot.drafts.filter((_, i) => {
    const p = slot.placements[i];
    if (!p || !left.has(cellKey(p))) return false;
    left.delete(cellKey(p));
    return true;
  });
}

/**
 * Общий проход. `dry` — предпросмотр: ни снятия, ни записи, ни побочек.
 *
 * Обеспечение денег раздачу НЕ останавливает: раздать в минус админ вправе
 * (владелец: «ограничивать админа раздавать в „-“ нельзя»). Остатки снимаются
 * до первой записи, сверяются с разложенным и уходят в отчёт отдельным полем.
 */
async function runPlan(plan: ScatterPlan, dry: boolean): Promise<ScatterReport> {
  const mapId = await godMapId();
  // Сид один на весь запуск: им же считается порядок клеток и им же — жребий
  // шаблонов внутри buildScatter. Совпасть предпросмотр с выполнением может
  // только так — оба проходят этот путь с одним числом.
  const seed = plan.seed ?? null;
  const builds = await buildScatter(plan);
  if (!dry) await assertScatterUsdt(builds.flatMap((b) => b.drafts));
  const notes = builds.flatMap((b) => b.notes);

  // Снимаем убитых ПЕРЕД подбором клеток: их места тут же уходят в розыгрыш.
  const removed = new Map<ScatterGroup, number>();
  const killed = dry ? await countKilled(mapId) : null;
  for (const b of builds) {
    if (!section(plan, b.group).removeKilled) continue;
    const dead = killed?.[b.group];
    removed.set(b.group, dry ? (dead?.total ?? 0) : await removeKilled(mapId, b.group));
    // Сирота — объект с удалённым шаблоном: «чёрная точка», вскрывать нечего.
    // В числе снимаемых он неотличим от сундука, поэтому называем его вслух:
    // уйдёт он вместе со всеми, и админ вправе знать, что часть уходящего —
    // мусор карты, а не отработавшая игроками добыча.
    if (dead && dead.orphan > 0) {
      notes.push(
        `${GROUP_LABEL[b.group]}: из них ${dead.orphan} с пропавшим шаблоном — ` +
          `их снимем вместе со всеми`,
      );
    }
  }
  if (dry && removed.size > 0) {
    notes.push(
      "Предпросмотр считает клетки и остатки ДО сноса убитых — на деле " +
        "и места, и денег в пуле будет больше",
    );
  }

  // Остатки читаем ПОСЛЕ сноса, но ДО записи: снятый невскрытым сундук вернул
  // свой номинал в пул, а размещение, наоборот, тут же его заложит.
  const free = await readFreeFunds(builds.flatMap((b) => b.drafts));

  const slots = await assign(mapId, builds, seed);
  const groups: ScatterGroupReport[] = [];
  const placed: ScatterDraft[] = [];

  for (const b of builds) {
    const slot = slots.get(b.group) ?? emptySlot();
    const cells = dry ? slot.placements : await placeObjects(mapId, slot.placements);
    const mine = dry ? slot.drafts : placedDrafts(slot, cells);
    const lost = slot.placements.length - mine.length;
    if (lost > 0) {
      notes.push(
        `${GROUP_LABEL[b.group]}: ${lost} клеток заняли, пока раскладка шла — ` +
          `эти объекты не встали`,
      );
    }
    placed.push(...mine);
    groups.push({
      group: b.group,
      removed: removed.get(b.group) ?? 0,
      created: mine.length,
      short: slot.short,
      lost,
      // Недостача местности считается по выданным клеткам: объект, который и
      // так не встал, «не на своей земле» стоять не может.
      offLand: Math.min(slot.offLand, mine.length),
    });
  }

  const cover = fundCover(free, placed);
  notes.push(...cover.notes);
  const shortCells = groups.reduce((a, g) => a + g.short, 0);
  if (shortCells > 0) notes.push(`Свободных клеток не хватило на ${shortCells} объектов`);
  // Без сида раскладка неповторима: карта та же, а объекты лягут иначе. Говорим
  // это вслух — молча отдать «переделай и надейся» админу нельзя.
  notes.push(
    seed === null
      ? "Сид не задан — эту раскладку не повторить: следующий запуск разложит иначе"
      : `Сид раскладки ${seed} — тем же числом она повторится клетка в клетку`,
  );
  if (!dry) await afterScatter(mapId);

  return { seed, groups, resources: await tallyResources(placed), shortfalls: cover.short, notes };
}

/** Сухой прогон: не пишет ничего, показывает, что БУДЕТ сделано. */
export const adminScatterPreview = createServerFn({ method: "POST" })
  .inputValidator(parseScatterPlan)
  .handler(async ({ data }): Promise<ScatterReport> => {
    requireAdmin();
    return runPlan(data, true);
  });

/** Выполнение. Возвращает отчёт по ФАКТИЧЕСКИ разложенному. */
export const adminScatterRun = createServerFn({ method: "POST" })
  .inputValidator(parseScatterPlan)
  .handler(async ({ data }): Promise<ScatterReport> => {
    requireAdmin();
    return runPlan(data, false);
  });
