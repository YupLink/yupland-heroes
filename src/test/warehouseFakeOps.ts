// Подменённые функции склада и рюкзака для warehouse-move / warehouse-origin
// тестов: запись на полку (upsertSlot), выдача в рюкзак (depositToBackpack),
// чтение полок и сверки меток. Строки живут в warehouseFake.ts; метки здесь
// ведутся тем же правилом, что в SQL (stack-origin): прежние — не больше count,
// мобы первыми, плюс прибавка.
import { dec, decNum } from "@/test/numeric";
import {
  LABELS,
  allBagRows,
  db,
  item,
  type Item,
  type Marks,
  type Shelf,
} from "@/test/warehouseFake";
import { originAdds, type OriginQty, type StackOrigin } from "@/server/api/beta-raid/stack-origin";

/** loadSlots склада: свои полки игрока и общая. */
export const fakeSlots = (account: string) =>
  db.shelves
    .filter((x) => x.count > 0n && (x.scope === "shared" || x.owner === account))
    .map((x) => ({ scope: x.scope, stack_key: x.key, count: decNum(x.count) }));

/** Метки + прибавка: прежние (не больше count, мобы первыми) плюс новые. */
function grow(r: Item, qty: bigint, add: Marks): void {
  let room = r.count;
  for (const k of LABELS) {
    const kept = r[k] < room ? r[k] : room;
    room -= kept;
    r[k] = kept + add[k];
  }
  r.count += qty;
}

const marksOf = (o?: Partial<OriginQty>): Marks => ({
  mob: dec(String(o?.mob ?? 0)),
  mine: dec(String(o?.mine ?? 0)),
  field: dec(String(o?.field ?? 0)),
  loot: dec(String(o?.loot ?? 0)),
});

/**
 * upsertSlot: место на полке держит splitDeposit со своим тестом; метки — как в
 * SQL: личная полка складывает их, общая меток не хранит (обнуляет и свои).
 */
export function fakeUpsert(
  scope: Shelf["scope"],
  account: string | null,
  key: string,
  qty: number,
  origin?: Partial<OriginQty>,
): boolean {
  const plan = db.upsertPlan.length ? db.upsertPlan.shift() : db.upsertOk;
  if (plan === "throw") throw new Error("MCP POST 502");
  if (!plan) return false;
  let x = db.shelves.find((r) => r.scope === scope && r.owner === account && r.key === key);
  if (!x) {
    x = { ...item("0"), scope, owner: account, key };
    db.shelves.push(x);
  }
  if (scope === "shared") {
    x.count += dec(qty);
    for (const k of LABELS) x[k] = 0n;
    return true;
  }
  grow(x, dec(qty), marksOf(originAdds(qty, origin)));
  return true;
}

/** depositToBackpack: та же проверка ячеек, что делает SQL (CEIL(count/20)), и метки. */
export function fakeDeposit(o: {
  item: { kind: string; id: string };
  qty: number;
  origin?: StackOrigin | Partial<OriginQty>;
  mob?: boolean;
}): void {
  if (db.depositFails) {
    db.beforeDepositFail?.();
    throw new Error("market.backpack_need:1:0");
  }
  const key = `${o.item.kind}:${o.item.id}`;
  const cur = db.bp.get(key)?.count ?? 0n;
  const after = new Map(db.bp).set(key, { ...item("0"), count: cur + dec(o.qty) });
  const cells = [...after.values()].reduce((n, r) => n + Math.ceil(decNum(r.count) / 20), 0);
  if (cells > db.capacity) throw new Error("market.backpack_need:1:0");
  if (!db.bp.has(key)) db.bp.set(key, item("0"));
  grow(db.bp.get(key)!, dec(o.qty), marksOf(originAdds(o.qty, o.origin, o.mob)));
}

/** Сумма меток по всем рюкзакам и полкам — ни одна не рождается и не пропадает. */
export function totalMarks(): Marks {
  const all = [...allBagRows(), ...db.shelves];
  const sum = (k: keyof Marks) => all.reduce((s, r) => s + r[k], 0n);
  return { mob: sum("mob"), mine: sum("mine"), field: sum("field"), loot: sum("loot") };
}

/** Инвариант каждой строки: метки ≥ 0 и в сумме не больше count. */
export function invariantBroken(): string | null {
  for (const r of [...allBagRows(), ...db.shelves]) {
    if (LABELS.some((k) => r[k] < 0n)) return `минус в метке: ${JSON.stringify(r, big)}`;
    if (r.mob + r.mine + r.field + r.loot > r.count)
      return `меток больше count: ${JSON.stringify(r, big)}`;
  }
  return null;
}
const big = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
