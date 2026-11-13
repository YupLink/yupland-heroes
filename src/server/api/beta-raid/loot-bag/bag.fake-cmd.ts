// Записи фейка базы мешочков (bag.fake.ts): уронить (и «забор»), снять,
// закрыть и развязать снятие, положить — по смыслу операторов bag-sql,
// bag-take-sql, bag-back-sql и bag-put-sql. Закопать/выкопать и чтения —
// bag.fake-read.ts.
import { originPlus, type OriginQty } from "@/server/api/beta-raid/stack-origin";
import {
  DUST,
  TTL,
  alive,
  db,
  fence,
  livePortion,
  md5,
  packOf,
  readMarks,
  round,
  spend,
  type Cmd,
  type FakeBag,
  type Item,
  type Part,
} from "@/server/api/beta-raid/loot-bag/bag.fake";
import { runRead } from "@/server/api/beta-raid/loot-bag/bag.fake-read";
import { takeRes, takeResOp } from "@/server/api/beta-raid/loot-bag/bag.fake-res";

type At = { key: string; mapId: string; q: number; r: number; account: string };
const row = (v: unknown) => [{ _row: v }];
const zero = (): OriginQty => ({ mob: 0, mine: 0, field: 0, loot: 0 });

function newBag(at: At, items: FakeBag["items"]): FakeBag {
  const id = `lb_${md5(at.key)}`;
  const bag = {
    id,
    mapId: at.mapId,
    q: at.q,
    r: at.r,
    createdAt: db.now,
    updatedAt: db.now,
    buried: false,
    droppedBy: at.account,
    items,
  };
  db.bags.set(id, bag);
  return bag;
}

/** Снять стопку: живые порции от ранней к поздней, пыль — со стеком, если влезает. */
function take(c: Cmd): unknown[] {
  const op = String(c.op);
  const prior = db.ops.get(op);
  if (prior) return row({ prior: prior.state, qty: prior.qty, ...prior.marks });
  const bag = db.bags.get(String(c.bagId));
  const key = String(c.stackKey);
  const live = (bag && !bag.buried ? bag.items : [])
    .filter((p) => p.stackKey === key && livePortion(p))
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (!bag || live.length === 0) return row({ prior: null, qty: null });
  const total = live.reduce((s, p) => s + p.count, 0);
  const qty = Number(c.qty);
  let left = total - qty < DUST ? Math.min(total, Math.max(qty, Number(c.cap ?? qty))) : qty;
  const parts: Part[] = [];
  for (const p of live) {
    if (!(left > 0)) break;
    const n = Math.min(p.count, left);
    parts.push({ e: p.expiresAt, n, marks: spend(p, n) });
    left = round(left - n);
  }
  const moved = round(parts.reduce((s, p) => s + p.n, 0));
  const marks = parts.reduce((m, p) => originPlus(m, p.marks), zero());
  bag.updatedAt = db.now;
  const heroId = String(c.heroId);
  db.ops.set(op, { bagId: bag.id, heroId, kind: "take", stackKey: key, qty: moved, marks, parts, state: "taken", at: db.now });
  return row({ prior: null, qty: moved, ...marks });
}

/** Развязка снятия: «забор», и если выдачи не было — назад в те же порции. */
function back(c: Cmd): unknown[] {
  const blocked = fence(String(c.nonce));
  const o = db.ops.get(String(c.op));
  const mine = o?.state === "taken" && o.bagId === String(c.bagId);
  let [undone, back, done] = [false, false, false];
  if (o && mine && blocked) {
    o.state = "undone";
    undone = true;
    const bag = db.bags.get(o.bagId);
    for (const part of o.parts ?? []) {
      const p = bag?.items.find((x) => x.stackKey === o.stackKey && x.expiresAt === part.e);
      if (!p) continue;
      const count = round(p.count + part.n);
      p.marks = readMarks(count, originPlus(readMarks(p.count, p.marks), part.marks));
      p.count = count;
      back = true;
    }
  } else if (o && mine) {
    o.state = "done";
    done = true;
  }
  return row({ blocked, undone, back, done });
}

/** Ответ «положить» — строка ключа нажатия с подписью вида. */
function putRow(op: string): unknown[] {
  const o = db.ops.get(op);
  const p = db.bags.get(o?.bagId ?? "")?.items.find((x) => x.stackKey === o?.stackKey);
  return o ? row({ qty: o.qty, kind: p?.kind, refId: p?.refId, name: p?.name, image: null }) : [];
}

/** «Забор» ключа нажатия (положить / закопать): исход 'failed', если ключа ещё нет. */
function fenceOp(c: Cmd, kind: string): void {
  const op = String(c.op);
  if (db.ops.has(op)) return;
  const [bagId, stackKey] = [String(c.bagId), c.stackKey ? String(c.stackKey) : null];
  const heroId = c.heroId ? String(c.heroId) : null;
  db.ops.set(op, { bagId, heroId, kind, stackKey, qty: 0, marks: zero(), state: "failed", at: db.now });
}

/** Положить из рюкзака: одна транзакция; изношенную штуку база не отпустит. */
function put(c: Cmd): unknown[] {
  const op = String(c.op);
  const [bagId, heroId, key, qty] = [String(c.bagId), String(c.heroId), String(c.stackKey), Number(c.qty)];
  const bag = db.bags.get(bagId);
  const s = packOf(heroId).get(key);
  if (!db.ops.has(op) && bag && !bag.buried && alive(bag) && s && s.count - qty > -1e-9) {
    if (s.wear > 0 && round(s.count - qty) < 1) {
      throw new Error('new row violates check constraint "raid_hero_backpack_worn_stays"');
    }
    const marks = spend(s, qty);
    if (s.count <= 0) packOf(heroId).delete(key);
    const e = db.now + TTL;
    const id = key.slice(key.indexOf(":") + 1);
    const meta: Item = { kind: "custom", refId: id, name: db.catalog.get(id)?.name ?? id, image: null };
    const p = bag.items.find((x) => x.stackKey === key && x.expiresAt === e);
    if (p) Object.assign(p, { count: round(p.count + qty), marks: originPlus(p.marks, marks) });
    else bag.items.push({ ...meta, stackKey: key, expiresAt: e, count: qty, marks });
    bag.updatedAt = db.now;
    db.ops.set(op, { bagId, heroId, kind: "put", stackKey: key, qty, marks, state: "done", at: db.now });
  }
  return putRow(op);
}

export function runCmd(c: Cmd): unknown[] {
  switch (c.cmd) {
    case "drop": {
      const at = c.at as At;
      const id = `lb_${md5(at.key)}`;
      if (db.bags.has(id)) return row({ id, fresh: false, n: 0 });
      const stacks = c.stacks as Array<Item & { stackKey: string; count: number; marks: OriginQty }>;
      const items = stacks.map((s) => ({
        stackKey: s.stackKey,
        kind: s.kind,
        refId: s.refId,
        name: s.name,
        image: s.image,
        count: s.count,
        marks: { ...s.marks },
        expiresAt: db.now + TTL,
      }));
      newBag(at, items);
      return row({ id, fresh: true, n: items.length });
    }
    case "dropFence": {
      const at = c.at as At;
      const id = `lb_${md5(at.key)}`;
      if (!db.bags.has(id)) newBag(at, []);
      return row({ id, real: (db.bags.get(id)?.items.length ?? 0) > 0 });
    }
    case "take":
      return take(c);
    case "takeRes":
      return takeRes(c);
    case "takeResOp":
      return takeResOp(c);
    case "done": {
      const o = db.ops.get(String(c.op));
      if (o?.state === "taken") o.state = "done";
      return [];
    }
    case "fence":
      return row({ blocked: fence(String(c.nonce)) });
    case "back":
      return back(c);
    case "put":
      return put(c);
    case "putFence":
      fenceOp(c, "put");
      return putRow(String(c.op));
    case "digFence":
      fenceOp(c, c.bury ? "bury" : "dig");
      return row({ state: db.ops.get(String(c.op))?.state });
    default:
      return runRead(c);
  }
}
