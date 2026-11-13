// Команды фейка обычного сундука — операторы по смыслу SQL (pchest-*-sql):
// каждый целиком, как под локом. Ответ — строки так, как их отдаёт база
// (`[{ _row: … }]`, row_to_json).
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  DUST,
  NO,
  addToPack,
  cellsOf,
  chestAtCell,
  chestById,
  f,
  md5,
  packOf,
  readMarks,
  round,
  slotsOf,
} from "@/server/api/beta-raid/plain-chest/pchest.fake";
import { liftCmds } from "@/server/api/beta-raid/plain-chest/pchest.fake-lift";
import { passCmds } from "@/server/api/beta-raid/open-pass/pass.fake";

type Cmd = Record<string, unknown> & { cmd: string };
export type O = Record<string, unknown>;
export const row = (v: unknown) => [{ _row: v }];
const S = (v: unknown) => String(v);
const N = (v: unknown) => Number(v);

function place(o: O) {
  const [op, key] = [S(o.op), `${o.q},${o.r}`];
  const was = f.ops.has(op);
  const busy = f.blocked.has(key) || f.objects.has(key) || chestAtCell(key);
  const pack = packOf(S(o.heroId));
  const box = pack.get(S(o.stackKey));
  const hasBox = !!box && box.count >= 1 && (box.wear === 0 || box.count >= 2);
  let placed = false;
  if (!was && !busy && hasBox && box) {
    const id = `pc_${md5(op)}`;
    f.chests.set(key, {
      id,
      q: N(o.q),
      r: N(o.r),
      itemId: S(o.itemId),
      name: S(o.name),
      buried: false,
      placedBy: S(o.account),
    });
    const left = round(box.count - 1);
    if (left >= DUST) pack.set(S(o.stackKey), { ...box, count: left, marks: readMarks(left, box.marks) });
    else pack.delete(S(o.stackKey));
    f.ops.set(op, { state: "done", qty: 1, result: null, kind: "place" });
    placed = true;
  }
  return row({ was, placed, cell: true, busy, box: hasBox });
}

function put(o: O) {
  const [op, key, qty] = [S(o.op), S(o.stackKey), N(o.qty)];
  const prior = f.ops.get(op);
  const ch = chestById(S(o.chestId));
  const here = !!ch && !ch.buried;
  const pack = packOf(S(o.heroId));
  const src = pack.get(key);
  const slots = slotsOf(S(o.chestId));
  const used = cellsOf([...slots.values()].map((s) => s.count));
  const same = slots.get(key)?.count ?? 0;
  const mv = src ? (src.count - qty < DUST ? src.count : qty) : null;
  const worn = !!src && src.wear > 0 && (mv ?? 0) > src.count - 1 + 1e-9;
  const fits =
    mv == null
      ? null
      : Math.ceil(round(same + mv) / CELL_SIZE) - Math.ceil(same / CELL_SIZE) <=
        Math.max(10, used) - used;
  let moved = false;
  if (!prior && here && src && mv != null && mv > 0 && fits && !worn) {
    if (src.count > mv) {
      const left = round(src.count - mv);
      pack.set(key, { ...src, count: left, marks: readMarks(left, src.marks) });
      moved = true;
    } else if (src.count === mv && src.wear === 0) {
      pack.delete(key);
      moved = true;
    }
    if (moved) {
      const cur = slots.get(key);
      slots.set(key, {
        count: round((cur?.count ?? 0) + mv),
        kind: src.kind,
        refId: key.split(":")[1] ?? null,
        name: src.name,
      });
      f.ops.set(op, { state: "done", qty: mv, result: null, kind: "put" });
    }
  }
  const kind = src?.kind ?? null;
  return row({
    prior: prior?.state ?? null,
    prior_qty: prior?.qty ?? null,
    worn,
    moved,
    mv,
    here,
    have: !!src,
    fits,
    kind,
    ref_id: key.split(":")[1] ?? null,
    name: src?.name ?? null,
  });
}

function take(o: O) {
  const [op, key, qty, cap] = [S(o.op), S(o.stackKey), N(o.qty), N(o.cap)];
  const prior = f.ops.get(op);
  const ch = chestById(S(o.chestId));
  const here = !!ch && !ch.buried;
  const slots = slotsOf(S(o.chestId));
  const slot = slots.get(key);
  const pack = packOf(S(o.heroId));
  const cur = pack.get(key)?.count ?? 0;
  const counts = (potion: boolean) =>
    [...pack].filter(([k]) => f.potions.has(k) === potion).map(([, s]) => s.count);
  const [items, potions] = [cellsOf(counts(false)), cellsOf(counts(true))];
  const mv = slot ? (slot.count - qty < DUST ? Math.min(slot.count, Math.max(qty, cap)) : qty) : null;
  const d = mv == null ? 0 : Math.ceil(round(cur + mv) / CELL_SIZE) - Math.ceil(cur / CELL_SIZE);
  const fit = o.potion
    ? potions + d <= N(o.potionCapacity)
    : items + d <= Math.max(N(o.capacity), items);
  let moved = false;
  if (!prior && here && slot && mv != null && mv > 0 && fit) {
    if (slot.count > mv) slot.count = round(slot.count - mv);
    else slots.delete(key);
    addToPack(S(o.heroId), key, mv, slot.name);
    f.ops.set(op, { state: "done", qty: mv, result: null, kind: "take" });
    moved = true;
  }
  return row({
    prior: prior?.state ?? null,
    prior_qty: prior?.qty ?? null,
    worn: false,
    moved,
    mv,
    here,
    have: !!slot,
    fits: slot ? fit : null,
    kind: slot?.kind ?? null,
    ref_id: slot?.refId ?? null,
    name: slot?.name ?? null,
  });
}

const CMDS: Record<string, (o: O) => unknown[]> = {
  place,
  put,
  take,
  ...liftCmds,
  ...passCmds,
  opSweep: () => [],
};

export function runCmd(c: Cmd): unknown[] {
  const fn = CMDS[c.cmd];
  if (!fn) throw new Error(`fake: нет команды ${c.cmd}`);
  return fn(c);
}

/** Для проверок: метки стопки рюкзака без изменений (безымянное — нули). */
export const marksOf = (heroId: string, key: string) => packOf(heroId).get(key)?.marks ?? NO;
