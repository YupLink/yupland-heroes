// Полки склада: чтение, запись и проверка «стою рядом».
//
// Вынесено из warehouse.ts (правило ≤250 строк): там остались server-fn и
// правила перекладывания, здесь — работа с самими ячейками.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { nanoid } from "nanoid";
import { ownCell } from "./encounter-where";
import { areNeighbors } from "./helpers";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import { SHARED_CELLS, stackCells, splitDeposit } from "@/lib/warehouseCells";
// Запись на полку живёт отдельно (лимит 250 строк), зовут её и отсюда, и из окна склада.
import { upsertSlot } from "./warehouse-upsert";
import { noteShelf } from "./econ/trade-hooks";
import { originAdds, type StackOrigin } from "@/server/api/beta-raid/stack-origin";
export { upsertSlot } from "./warehouse-upsert";

export type WarehouseStack = {
  stackKey: string;
  kind: string;
  /** Ключ ресурса или id шаблона — для рендера иконки клиентом. */
  refId?: string | null;
  name: string;
  image: string | null;
  count: number;
  cells: number;
  /** Личная ячейка игрока или общая полка. */
  scope: "own" | "shared";
};

export type SlotRow = {
  scope: "own" | "shared";
  owner_account: string | null;
  stack_key: string;
  kind: string;
  ref_id: string | null;
  item_id: string | null;
  name: string;
  image: string | null;
  count: number;
};

/** Склад на этой клетке и игрок рядом с ним. Иначе — отказ. */
export async function warehouseAt(wallet: string, mapId: string, q: number, r: number) {
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "warehouse") throw new Error("Это не склад");
  if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Склад ещё не достроен");
  const pos = await ownCell(wallet);
  const near = !!pos && (areNeighbors(pos.q, pos.r, q, r) || (pos.q === q && pos.r === r));
  if (!near) throw new Error("Сначала подойди к складу");
  return b;
}

/** Что лежит на складе: мои личные ячейки и общая полка. */
export async function loadSlots(
  mapId: string,
  q: number,
  r: number,
  account: string,
): Promise<SlotRow[]> {
  const rows = (await mcpExec(
    `SELECT scope, owner_account, stack_key, kind, ref_id, item_id, name, image, count
       FROM yuplink.raid_warehouse_slot
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} AND count > 0
        AND (scope = 'shared' OR owner_account = ${sqlStr(account)})
      ORDER BY scope, updated_at;`,
    { wrapJson: true },
  ).catch(() => [])) as SlotRow[];
  return rows ?? [];
}

export const toStack = (row: SlotRow): WarehouseStack => ({
  stackKey: row.stack_key,
  kind: row.kind,
  refId: row.ref_id,
  name: row.name,
  image: row.image,
  count: Number(row.count) || 0,
  cells: stackCells(Number(row.count) || 0),
  scope: row.scope,
});

// Достроенные склады карты (с кэшем 30 с) — warehouse-map-cells.ts.
export { warehouseCells, nearestOf, nearestWarehouse } from "./warehouse-map-cells";

/**
 * Зачислить units ТОВАРА на склад: сначала личные ячейки аккаунта, остаток — в
 * общие (та же splitDeposit, что и при ручной сдаче). Из рюкзака НЕ берём —
 * источник тут поле, а не игрок.
 *
 * НЕ бросает: любую неудавшуюся запись считаем «не легло» и отдаём в rejected,
 * чтобы вызывающий вернул ровно непринятое обратно на поле. Иначе при падении на
 * второй ячейке первая уже осела бы на складе, а поле получило бы полный возврат —
 * то есть товар задвоился бы. Возвращает, сколько реально легло и что не влезло.
 */
export async function creditItemToWarehouse(opts: {
  mapId: string;
  at: { q: number; r: number };
  account: string;
  stackKey: string;
  snap: { kind: string; refId: string | null; name: string; image: string | null };
  units: number;
  /** База op-ключа: own/shared получают свои суффиксы (идемпотентность записи). */
  op: string;
  /**
   * Откуда товар (stack-origin): урожай грядки — "field". Метку получает только
   * личная полка: осевшее на общей — ничьё, безымянное. Без него — «безымянное».
   */
  origin?: StackOrigin;
}): Promise<{ own: number; shared: number; rejected: number; failed: number }> {
  const { mapId, at, account, stackKey, snap, units, op } = opts;
  if (units <= 0) return { own: 0, shared: 0, rejected: 0, failed: 0 };
  const { ownCellsOf } = await import("./account-upgrade");
  const [slots, ownCells] = await Promise.all([
    loadSlots(mapId, at.q, at.r, account),
    ownCellsOf(account),
  ]);
  const same = (scope: "own" | "shared") =>
    slots.find((s) => s.scope === scope && s.stack_key === stackKey)?.count ?? 0;
  const counts = (scope: "own" | "shared") =>
    slots.filter((s) => s.scope === scope).map((s) => Number(s.count) || 0);
  const plan = splitDeposit({
    qty: units,
    ownCells,
    ownSame: Number(same("own")) || 0,
    ownCounts: counts("own"),
    sharedSame: Number(same("shared")) || 0,
    sharedCounts: counts("shared"),
  });
  let own = 0;
  let shared = 0;
  // «Не легло» бывает двух сортов: полка полна (честный отказ под локом) и
  // сбой записи (мост, база). Вызывающему важно различать: сгоревший от
  // тесноты урожай на поле не возвращается, а не записанный из-за сбоя — да.
  let failed = 0;
  if (plan.own > 0) {
    try {
      const okOwn = await upsertSlot(
        mapId,
        at,
        "own",
        account,
        stackKey,
        snap,
        plan.own,
        `${op}:own`,
        ownCells,
        originAdds(plan.own, opts.origin),
      );
      own = okOwn ? plan.own : 0;
    } catch {
      failed += plan.own;
    }
  }
  if (plan.shared > 0) {
    try {
      const okShared = await upsertSlot(
        mapId,
        at,
        "shared",
        null,
        stackKey,
        snap,
        plan.shared,
        `${op}:shared`,
        SHARED_CELLS,
      );
      shared = okShared ? plan.shared : 0;
    } catch {
      failed += plan.shared;
    }
  }
  // Журнал: урожай с поля лёг на ОБЩУЮ полку (put) — его может забрать кто
  // угодно; в личные ячейки (take) — это свой счёт: личную полку журнал не
  // пишет, а «Продажа рыбы» (§8.27 п. 10) засчитывает свою выращенную рыбу —
  // без этой строки урожай был бы для неё «сверх журнала». Ключ повтора —
  // op-ключ записи (best-effort).
  const src = { source: "field" as const, account, mapId, q: at.q, r: at.r, stackKey, snap };
  if (own > 0) void noteShelf({ ...src, side: "take", qty: own, ref: `${op}:own` });
  if (shared > 0) void noteShelf({ ...src, qty: shared, ref: `${op}:shared` });
  return { own, shared, rejected: units - own - shared - failed, failed };
}

/** Сколько ячеек занято: личных у этого игрока и общих у всех. */
export async function warehouseCellsUsed(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<{ own: number; shared: number }> {
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) return { own: 0, shared: 0 };
  const rows = await loadSlots(mapId, q, r, account);
  const cells = (scope: "own" | "shared") =>
    rows
      .filter((s) => s.scope === scope)
      .reduce((sum, s) => sum + stackCells(Number(s.count) || 0), 0);
  return { own: cells("own"), shared: cells("shared") };
}
