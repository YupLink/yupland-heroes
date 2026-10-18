// Побег объектов от подошедшего игрока.
//
// Зовётся из шага (move-step) и отвечает ему списком переездов. Ждать этот
// ответ приходится ровно в тот шаг, где рядом и правда кто-то убегает: пока
// таких соседей нет (обычный случай), проверка — это чтение Map в памяти.
//
// Почему шаг всё-таки ждёт. Подход к цели — это «дойди и ударь» одним
// действием: последний шаг ставит героя вплотную, и тут же уходит запрос на
// карточку боя. Если побег досылать вдогонку, эти два события идут наперегонки,
// и игрок примерно в половине случаев получал «Объект не найден» вместо
// понятного «цель ушла». Ответ шага знает про побег — и гонки нет вовсе.
//
// Соседям по карте о том же сообщает живой поток (raidLive «fled»).
import { mcpExec } from "../../db/mcpClient";
import { publishRaid } from "../../raidLive";
import { cellTruthPatches } from "./map-change-hooks";
import { recordMapChange } from "./map-journal";
import { loadVoidCells } from "./voidCells";
import { loadFleeCells, noteFleeMoved, type Fleeing } from "./flee-cells";
import { fleeGridSql, type FleeStep } from "./flee-sql";
import { fleeMovesSql } from "./flee-sql-moves";
import {
  FLEE_DIRS,
  FLEE_STEPS,
  cellKey,
  hexesWithin,
  pickFleeCell,
  rollFleeSteps,
  type Hex,
} from "./flee-rules";
import type { ObjectLayer } from "./runners";
import type { CellPatch } from "@/lib/raid/mapDelta";

/**
 * Состоявшийся побег — ключами клеток «q,r», как их понимает карта клиента.
 *
 * `patches` — ПРАВДА затронутых клеток из базы (map-change-hooks), а не
 * «откуда/куда»: клиент кладёт её как есть и ничего не угадывает. Угадывание
 * по from/to ломалось, когда беглец уходил из-под одноимённого верхнего
 * (стирало верхний) и когда два побега одного шага шли цепочкой (A под B, B
 * дальше — A пропадал до дельты). `via` — промежуточная клетка побега на две,
 * для ломаной стрелки; `layer` — откуда ушёл, для запасного пути без правды.
 */
export type FleeMove = {
  from: string;
  to: string;
  objectId: string;
  via?: string;
  layer: ObjectLayer;
  patches?: CellPatch[];
};

type GridRow = {
  q: number;
  r: number;
  free: boolean | null;
  pass: boolean | null;
  water: boolean | null;
  players: unknown;
};

/** Разведанный кусок карты: посадка, проход и «вода ли» по каждой клетке. */
type Ground = {
  free: Map<string, boolean>;
  pass: Map<string, boolean>;
  water: Map<string, boolean>;
};

/** Кого разведка нашла рядом: [[q,r], …]. */
function parsePlayers(raw: unknown): Hex[] {
  if (!Array.isArray(raw)) return [];
  const out: Hex[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2) out.push({ q: Number(p[0]), r: Number(p[1]) });
  }
  return out;
}

/** Один разбегающийся: откуда он бежит и на каком слое сейчас лежит. */
type Runaway = { from: Hex; objectId: string; layer: ObjectLayer };

/**
 * Кто убегает от шага на клетку `at`: сам объект под ногами и все шесть
 * соседей. Клетка под ногами входит нарочно — беглец её не запирает, и игрок
 * может встать прямо на него; ближе уже некуда, значит бежать тем более пора.
 *
 * С одной клетки бегут ОБА слоя, если убегающих там двое: объект клетки и
 * спрятавшийся под ним беглец. Верхний не заслоняет нижнего и наоборот.
 */
function fleeingAround(cells: Map<string, Fleeing[]>, at: Hex): Runaway[] {
  const out: Runaway[] = [];
  for (const d of [{ q: 0, r: 0 }, ...FLEE_DIRS]) {
    const from = { q: at.q + d.q, r: at.r + d.r };
    for (const hit of cells.get(cellKey(from)) ?? []) out.push({ from, ...hit });
  }
  return out;
}

/**
 * Куда пойдёт каждый из разбегающихся — ДО единой записи.
 *
 * Занятые клетки помечаются по ходу выбора: два гриба не должны целиться в одну
 * (слой держит одного на клетку). Освободившиеся при этом занятыми и остаются —
 * запись идёт одним оператором и видит карту одного момента, где ушедший ещё
 * стоит на месте.
 */
function planFlight(runaways: Runaway[], at: Hex, ground: Ground, players: Hex[]): FleeStep[] {
  const steps: FleeStep[] = [];
  // Игроки — препятствие: сквозь чужой лагерь не пробежать. Беглец обходит их,
  // а если обойти негде — его этим и зажимают (тогда pickFleeCell вернёт null и
  // объект остаётся принять бой). Подошедшего тоже добавляем в стену.
  const occupied = new Set(players.map(cellKey));
  occupied.add(cellKey(at));
  for (const run of runaways) {
    // Вода запрещена только сухопутному: стоящий в воде по ней и уходит,
    // иначе мухомор посреди залива не сдвинется никуда (flee-sql.canStandSql).
    const swims = ground.water.get(cellKey(run.from)) === true;
    const ok = (h: Hex, layer: Map<string, boolean>) => {
      const key = cellKey(h);
      if (occupied.has(key)) return false;
      return layer.get(key) === true && (swims || ground.water.get(key) !== true);
    };
    // Посадка — под живой объект можно (спрятаться); проход — сквозь него нет.
    const canStand = (h: Hex) => ok(h, ground.free);
    const canPass = (h: Hex) => ok(h, ground.pass);
    // Дальность своя на каждого: в грибной поляне один отбежит на клетку,
    // другой на две — и это заметно живее, чем синхронный отскок всей стайки.
    const pick = pickFleeCell(run.from, at, canStand, players, rollFleeSteps(), canPass);
    if (!pick) continue;
    ground.free.set(cellKey(pick.to), false);
    // Клетка посадки занята и как проход: второй беглец того же шага не
    // пробежит сквозь только что севшего.
    ground.pass.set(cellKey(pick.to), false);
    steps.push({ from: run.from, ...pick, objectId: run.objectId, layer: run.layer, swims });
  }
  return steps;
}

/**
 * Правда клеток побега — одним чтением, СИНХРОННО с ответом шага: клиент
 * получает её и в ответе, и в событии «fled», а дельта «map» уходит следом
 * фоном (версия карты, журнал). Клетки под куполом игроку не отдаём: событие
 * «fled» маршрут не чистит (sanitizeDeltaForPlayer — только для «map»).
 */
async function fledTruth(mapId: string, keys: string[]): Promise<CellPatch[]> {
  const patches = await cellTruthPatches(mapId, [...new Set(keys)]);
  // Нечего слать — версию карты не двигаем (пустая дельта всем клиентам).
  if (patches.length > 0) {
    recordMapChange(mapId, { patches }).catch((e: Error) =>
      console.warn("[beta-flee] дельта карты не разослана:", e.message),
    );
  }
  const dome = await loadVoidCells(mapId);
  return dome.size === 0 ? patches : patches.filter((p) => !dome.has(`${p.q},${p.r}`));
}

/**
 * Игрок встал на клетку — убегающие соседи уходят на две клетки дальше.
 *
 * НИКОГДА не бросает: побег — украшение шага, а не его часть, и оборванный мост
 * к базе не должен превращать состоявшийся шаг в ошибку. В этом случае вернётся
 * пустой список, а карта разъедется с базой лишь до ближайшего обновления.
 */
export async function fleeAroundStep(mapId: string, at: Hex): Promise<FleeMove[]> {
  const moves: FleeMove[] = [];
  try {
    const cells = await loadFleeCells(mapId);
    if (cells.size === 0) return moves;
    const runaways = fleeingAround(cells, at);
    if (runaways.length === 0) return moves;

    // Разведка ОДНИМ запросом на весь шаг: беглецы стоят вплотную к игроку, а
    // уйти могут на две клетки — значит весь их выбор лежит в трёх клетках от
    // него. Запрос на каждого стоил бы по рейсу к базе за одно и то же.
    const grid = (await mcpExec(fleeGridSql(mapId, hexesWithin(at, 1 + FLEE_STEPS)), {
      wrapJson: true,
    })) as GridRow[];
    const ground: Ground = { free: new Map(), pass: new Map(), water: new Map() };
    for (const row of grid ?? []) {
      const key = `${Number(row.q)},${Number(row.r)}`;
      ground.free.set(key, !!row.free);
      ground.pass.set(key, !!row.pass);
      ground.water.set(key, !!row.water);
    }
    const players = parsePlayers(grid?.[0]?.players);

    // Из счёта убираем того, кто подошёл: от него отбегаем по главному
    // правилу, а во втором (подальше от остальных) он бы всё перевесил.
    const others = players.filter((p) => p.q !== at.q || p.r !== at.r);
    const steps = planFlight(runaways, at, ground, others);
    if (steps.length === 0) return moves;

    // Одна запись на весь шаг: в грибной поляне разбегается сразу несколько, и
    // запрос на каждого стоил бы по рейсу к базе (flee-sql-moves).
    const done = (await mcpExec(fleeMovesSql(mapId, steps), { wrapJson: false })) as Array<
      Record<string, number>
    >;
    steps.forEach((step, n) => {
      if (!Number(done?.[0]?.[`m${n}`])) return;
      noteFleeMoved(mapId, step.from, step.to, step.objectId, step.layer);
      moves.push({
        from: cellKey(step.from),
        to: cellKey(step.to),
        objectId: step.objectId,
        ...(step.via ? { via: cellKey(step.via) } : {}),
        layer: step.layer,
      });
    });
    if (moves.length === 0) return moves;
    // Правда клеток — до публикации: событие и ответ шага несут одно и то же.
    // Не прочиталась — переезды уходят без неё, клиент угадает по from/to.
    const truth = await fledTruth(
      mapId,
      moves.flatMap((m) => [m.from, m.to]),
    ).catch((e: Error) => {
      console.warn("[beta-flee] правда клеток не прочиталась:", e.message);
      return null;
    });
    for (const move of moves) {
      if (truth) {
        const mine = new Set([move.from, move.to]);
        move.patches = truth.filter((p) => mine.has(`${p.q},${p.r}`));
      }
      publishRaid({ mapId, type: "fled", ...move });
    }
  } catch (e) {
    console.warn("[beta-flee] побег не состоялся:", e);
  }
  return moves;
}
