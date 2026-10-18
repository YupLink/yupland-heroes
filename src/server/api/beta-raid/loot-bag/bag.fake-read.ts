// Фейк базы мешочков (bag.fake.ts), вторая половина: закопать/выкопать и
// чтения — мешочки во «втором обзоре», окно клетки, лопата, сборщик и
// зависшие снятия. Вынесено ради лимита ≤250 строк.
import { hexDistance } from "@/lib/raid/hex";
import { LOOT_BAG_SEE } from "@/lib/lootBag";
import { originPlus } from "@/server/api/beta-raid/stack-origin";
import {
  TTL,
  alive,
  db,
  livePortion,
  packOf,
  round,
  type Cmd,
  type FakeBag,
  type Portion,
} from "@/server/api/beta-raid/loot-bag/bag.fake";

const row = (v: unknown) => [{ _row: v }];
const last = (b: FakeBag) => Math.max(...b.items.filter(livePortion).map((p) => p.expiresAt));
const inFlight = (id: string) =>
  [...db.ops.values()].some((o) => o.bagId === id && o.state === "taken");
const quiet = (b: FakeBag | undefined) => !!b && b.updatedAt < db.now - 600_000;

/** Закопать: порции вида сливаются, срок всех — закапывание + 24 ч. Выкопать — сроки те же. */
function dig(c: Cmd): unknown[] {
  const op = String(c.op);
  const bag = db.bags.get(String(c.bagId));
  const cur = bag
    ? { alive: alive(bag), buried: bag.buried, busy: inFlight(bag.id) }
    : { alive: null, buried: null, busy: null };
  const prior = db.ops.get(op);
  if (prior) return row({ state: prior.state, ...cur, mine: prior.nonce === String(c.nonce) });
  const ok = !!bag && cur.alive === true && bag.buried === !c.bury && !(c.bury && cur.busy);
  if (ok && bag) {
    bag.buried = !!c.bury;
    bag.updatedAt = db.now;
    if (c.bury) {
      const merged = new Map<string, Portion>();
      for (const p of bag.items.filter(livePortion)) {
        const m = merged.get(p.stackKey);
        if (m) Object.assign(m, { count: round(m.count + p.count), marks: originPlus(m.marks, p.marks) });
        else merged.set(p.stackKey, { ...p, marks: { ...p.marks }, expiresAt: db.now + TTL });
      }
      bag.items = [...merged.values()];
    }
  }
  const state = ok ? "done" : "failed";
  const zero = { mob: 0, mine: 0, field: 0, loot: 0 };
  const kind = c.bury ? "bury" : "dig";
  const nonce = String(c.nonce);
  db.ops.set(op, { bagId: String(c.bagId), heroId: null, kind, stackKey: null, qty: 0, marks: zero, state, at: db.now, nonce });
  return row({ state, ...cur, mine: true });
}

/** Мешочки «второго обзора»: позиция по аккаунту, круг, разведанное, купол. */
function near(c: Cmd): unknown[] {
  const acc = String(c.account);
  const wallet = [...db.accounts].find(([, a]) => a === acc)?.[0] ?? acc;
  const p = db.pos.get(wallet);
  if (!p) return [];
  const shown = (b: FakeBag) =>
    c.admin || (!db.voids.has(`${b.q},${b.r}`) && db.seen.has(`${acc}|${b.q},${b.r}`));
  return [...db.bags.values()]
    .filter((b) => b.mapId === c.activeMapId && hexDistance(p.q, p.r, b.q, b.r) <= LOOT_BAG_SEE)
    .filter((b) => alive(b) && shown(b))
    .map((b) => ({
      _row: { id: b.id, q: b.q, r: b.r, buried: b.buried, leftMs: last(b) - db.now },
    }));
}

/** Окно клетки: у мешочка — позиции (сумма живых порций вида и ближайший срок). */
function cell(c: Cmd): unknown[] {
  return [...db.bags.values()]
    .filter((b) => b.mapId === c.mapId && b.q === c.q && b.r === c.r && alive(b))
    .map((b) => {
      const pos = new Map<string, Portion & { soon: number }>();
      for (const p of b.buried ? [] : b.items.filter(livePortion)) {
        const m = pos.get(p.stackKey);
        if (!m) pos.set(p.stackKey, { ...p, soon: p.expiresAt });
        else Object.assign(m, { count: round(m.count + p.count), soon: Math.min(m.soon, p.expiresAt) });
      }
      const items = [...pos.values()].map((p) => ({
        stackKey: p.stackKey,
        kind: p.kind,
        refId: p.refId,
        name: p.name,
        image: p.image,
        count: p.count,
        leftMs: p.soon - db.now,
      }));
      return { _row: { id: b.id, buried: b.buried, leftMs: last(b) - db.now, items } };
    });
}

/** Сборщик: сгоревшие и (у тихого мешочка) пустые порции, затем пустые тихие мешочки. */
function sweep(): unknown[] {
  for (const b of db.bags.values()) {
    if (inFlight(b.id)) continue;
    b.items = b.items.filter((p) => p.expiresAt > db.now && (p.count > 0 || !quiet(b)));
  }
  const gone: unknown[] = [];
  for (const [id, b] of db.bags) {
    if (b.items.length > 0 || !quiet(b) || inFlight(id)) continue;
    db.bags.delete(id);
    gone.push({ _row: { map_id: b.mapId, q: b.q, r: b.r } });
  }
  return gone;
}

export function runRead(c: Cmd): unknown[] {
  switch (c.cmd) {
    case "dig":
      return dig(c);
    case "near":
      return near(c);
    case "cell":
      return cell(c);
    case "shovel": {
      for (const [key, s] of packOf(String(c.heroId))) {
        const id = key.split(":")[1];
        const cat = db.catalog.get(id);
        if (cat?.shovel && s.count >= 1)
          return [{ _row: { itemId: id, name: cat.name, toolWear: cat.wear ?? null } }];
      }
      return [];
    }
    case "sweep":
      return sweep();
    case "stale":
      return [...db.ops]
        .filter(([, o]) => o.kind === "take" && o.state === "taken" && o.at < db.now - 120_000)
        .map(([op, o]) => ({
          _row: {
            op,
            bagId: o.bagId,
            heroId: o.heroId,
            q: db.bags.get(o.bagId)?.q ?? null,
            r: db.bags.get(o.bagId)?.r ?? null,
          },
        }));
    default:
      throw new Error(`фейк не знает команду ${c.cmd}`);
  }
}
