// Обеспечение наград карты: живой объект с Darai держит свою сумму из пула.
//
// На кошелёк дропа приходит два разных потока: выручка с билетов (её раздают
// холдерам) и переводы с darai_collection.near — игровой пул, из которого
// обеспечиваются награды на карте. Пока учёт был общий, «сколько карта уже
// пообещала игрокам» никто не знал.
//
// Правило простое, как расписка. Поставили на клетку живой сундук на 1000
// Darai — из пула карты списали 1000, а номер расписки лёг в сам объект.
// Игрок сундук вскрыл — расписка стала выплатой и гасится молча: деньги ушли
// по адресу. Админ убрал невскрытый сундук — расписка возвращает деньги в пул.
//
// Пул уходит в минус свободно: обещание игроку важнее бухгалтерии, и красное
// число над картой — повод пополнить коллекцию, а не запрет на выдачу.
//
// Здесь — решения и проводки; чтение снимка живёт в map-darai-read.ts (правило
// ≤250 строк). Расписка принадлежит ОБЪЕКТУ, а не месту: убежавший гриб увозит
// её с собой в слой беглецов, и номинал не задваивается.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { RUNNER_LAYER, type ObjectLayer } from "./runners";
import { readDaraiHold, type DaraiHoldSnapshot, type HoldRow } from "./map-darai-read";
import { releaseMapDaraiBulk, reserveMapDaraiBulk } from "./map-darai-moves";

export { readDaraiHold };
export type { HoldCell, DaraiHoldSnapshot } from "./map-darai-read";

/**
 * Расписка адресует КОНКРЕТНУЮ закладку, а не клетку: вернуть деньги можно
 * только тем номером, которым их заложили, и снятая бронь свой номер занимает
 * навсегда (darai-pools пишет по ключу `map_release:<ref>`). Номер жизни
 * объекта тут не годится: снятый и поставленный заново сундук получил бы тот
 * же номер, и повторную закладку пул принял бы за наш же дубль.
 */
const mkRef = (mapId: string, q: number, r: number) => `map:${mapId}:${q},${r}:${nanoid(8)}`;

type Decision = {
  q: number;
  r: number;
  /** Где лежит расписка: в клетке или в слое беглецов. */
  layer: ObjectLayer;
  /** Новая расписка; null — обеспечения на клетке больше нет. */
  ref: string | null;
  hold: number;
  /** Старую расписку вернуть в пул; null — гасим молча или возвращать нечего. */
  release: string | null;
};

/** Всё ли на клетке осталось прежним — тогда и пулу двигаться незачем. */
function untouched(a: HoldRow | undefined, b: HoldRow | undefined): boolean {
  return (
    (a?.ref ?? null) === (b?.ref ?? null) &&
    (a?.held ?? 0) === (b?.held ?? 0) &&
    (a?.darai ?? 0) === (b?.darai ?? 0) &&
    (a?.state ?? "none") === (b?.state ?? "none") &&
    (a?.objectId ?? null) === (b?.objectId ?? null)
  );
}

/** Что делать с клеткой: сравниваем «было» и «стало». */
function decide(before: HoldRow | undefined, after: HoldRow | undefined): Decision | null {
  // Клетку эта правка не задела. Важно не столько ради экономии запросов,
  // сколько ради того, чтобы одна кнопка «Восстановить» не заложила разом всю
  // карту: объекты, стоявшие там до появления учёта, обеспечения не просили и
  // просить задним числом не должны — пул двигают только изменения.
  if (untouched(before, after)) return null;

  const q = (after ?? before)?.q ?? 0;
  const r = (after ?? before)?.r ?? 0;
  const layer = (after ?? before)?.layer ?? 0;
  const ref = before?.ref ?? after?.ref ?? null;
  const held = before?.held ?? after?.held ?? 0;
  // Клетку могли стереть целиком (полное сохранение) — объекта нет, долга нет.
  const due = after?.state === "alive" ? after.darai : 0;
  // Игрок успел забрать: расписка стала выплатой, и вернуть её в пул значило бы
  // выдать награду дважды — один раз игроку, другой раз себе.
  const taken = before?.state === "player" || after?.state === "player";
  const sameObject = (before?.objectId ?? null) === (after?.objectId ?? null);

  // Ничего не сдвинулось: расписка на месте и ровно на ту сумму.
  if (ref && !taken && held === due && sameObject) return null;
  // Ни расписки, ни обязательства.
  if (!ref && due === 0) return null;

  return { q, r, layer, ref: due > 0 ? "" : null, hold: due, release: ref && !taken ? ref : null };
}

/**
 * Свести обеспечение после правки карты.
 *
 * Ничего не бросает: пул — бухгалтерия, а не игровая механика. Оборванный мост
 * к базе не должен превращаться в «правки не применились» на глазах у админа.
 */
export async function settleDaraiHold(before: DaraiHoldSnapshot): Promise<void> {
  try {
    const after = await readDaraiHold(before.mapId, before.cells);
    const writes: Decision[] = [];
    for (const k of new Set([...before.rows.keys(), ...after.rows.keys()])) {
      const d = decide(before.rows.get(k), after.rows.get(k));
      if (!d) continue;
      if (d.ref === "") d.ref = mkRef(before.mapId, d.q, d.r);
      writes.push(d);
    }
    if (writes.length === 0) return;

    // Клетки правим ПЕРЕД походом в пул. Оборвётся связь на середине — карта
    // недодержит обеспечения, но одно и то же не спишется и не вернётся дважды.
    await writeHolds(before.mapId, writes);

    const at = (w: Decision) => `карта ${before.mapId} (${w.q},${w.r})`;
    await releaseMapDaraiBulk(
      writes
        .filter((w) => w.release)
        .map((w) => ({ ref: w.release as string, note: `снят объект — ${at(w)}` })),
    );
    await reserveMapDaraiBulk(
      writes
        .filter((w) => w.ref && w.hold > 0)
        .map((w) => ({ ref: w.ref as string, amount: w.hold, note: `объект карты — ${at(w)}` })),
    );
  } catch (e) {
    console.warn("[map-darai] сведение обеспечения не удалось:", e);
  }
}

/** Новые расписки — одним запросом на пачку объектов каждого слоя. */
async function writeHolds(mapId: string, writes: Decision[]): Promise<void> {
  for (const layer of [0, RUNNER_LAYER] as ObjectLayer[]) {
    const mine = writes.filter((w) => w.layer === layer);
    const table = layer === RUNNER_LAYER ? "yuplink.beta_raid_runner" : "yuplink.raid_map_cells";
    const size = 300;
    for (let i = 0; i < mine.length; i += size) {
      const values = mine
        .slice(i, i + size)
        .map((w) => {
          const hold = Number.isFinite(w.hold) ? w.hold : 0;
          return `(${w.q}, ${w.r}, ${w.ref ? sqlStr(w.ref) : "NULL"}::text, ${hold}::numeric)`;
        })
        .join(",");
      if (!values) continue;
      await mcpExec(
        `UPDATE ${table} o SET darai_ref = v.ref, darai_hold = v.hold
           FROM (VALUES ${values}) AS v(q, r, ref, hold)
          WHERE o.map_id = ${sqlStr(mapId)} AND o.q = v.q AND o.r = v.r;`,
        { wrapJson: false },
      );
    }
  }
}
