// Команды фейка обычного сундука, вторая часть: снимок и запись «Забрать
// сундук», закопать/выкопать (и «забор» переворота). Первая часть и реестр —
// pchest.fake-cmd.ts.
import {
  NO,
  addToPack,
  chestById,
  f,
  fp,
  md5,
  packOf,
  slotsOf,
} from "@/server/api/beta-raid/plain-chest/pchest.fake";

type O = Record<string, unknown>;
const row = (v: unknown) => [{ _row: v }];
const S = (v: unknown) => String(v);

function snap(o: O) {
  const ch = f.chests.get(`${o.q},${o.r}`);
  const pack = packOf(S(o.heroId));
  const slots = ch ? slotsOf(ch.id) : new Map();
  return row({
    chest: ch
      ? { id: ch.id, itemId: ch.itemId, name: ch.name, image: null, buried: ch.buried, potion: false }
      : null,
    bag: [...pack]
      .filter(([, s]) => s.count > 0)
      .map(([stackKey, s]) => ({ stackKey, count: s.count, potion: f.potions.has(stackKey) })),
    slots: [...slots]
      .filter(([, s]) => s.count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([stackKey, s]) => ({
        stackKey,
        kind: s.kind,
        refId: s.refId,
        itemId: null,
        name: s.name,
        image: null,
        count: s.count,
        potion: f.potions.has(stackKey),
      })),
    bag_fp: fp(pack),
    slot_fp: fp(slots),
  });
}

type Row = { k: string; qty: number; name: string };
type Bagged = { k: string; n: number };

function pickup(o: O) {
  const op = S(o.op);
  const prior = f.ops.get(op);
  const ch = chestById(S(o.chestId));
  const exp = o.expect as { bagFp: string; slotFp: string };
  const fresh = fp(packOf(S(o.heroId))) === exp.bagFp && fp(slotsOf(S(o.chestId))) === exp.slotFp;
  const go = !prior && !!ch && !ch.buried && fresh;
  let bagId: string | null = null;
  if (go && ch) {
    f.chests.delete(`${ch.q},${ch.r}`);
    f.slots.delete(ch.id);
    for (const r of o.rows as Row[]) addToPack(S(o.heroId), r.k, r.qty, r.name);
    const bagged = o.bagged as Bagged[];
    if (bagged.length > 0) {
      bagId = `lb_${md5(`pchest:${ch.id}`)}`;
      const items = new Map(bagged.map((b) => [b.k, b.n]));
      f.bags.set(bagId, { q: ch.q, r: ch.r, droppedBy: S(o.account), items });
    }
    const picks = bagged.map((b) => ({ stackKey: b.k, qty: b.n }));
    const result = { taken: o.taken, bagged: picks, bagId };
    f.ops.set(op, { state: "done", qty: 0, result, kind: "pickup" });
  }
  return row({
    prior: prior?.result ?? null,
    picked: go,
    here: !!ch,
    buried: ch ? ch.buried : null,
    fresh,
    bag_id: bagId,
  });
}

type Target = { kind: string; chestId?: string; q?: number; r?: number; owner?: string };

function flip(o: O) {
  const op = S(o.op);
  const t = o.target as Target;
  const bury = o.bury === true;
  const prior = f.ops.get(op);
  const plain = t.kind === "plain" ? chestById(S(t.chestId)) : undefined;
  const key = `${t.q},${t.r}`;
  const magic = t.kind === "magic" ? f.magic.get(key) : undefined;
  const cur = t.kind === "plain" ? plain : magic && magic.owner === t.owner ? magic : undefined;
  const g = t.kind === "magic" ? f.guards.get(key) : undefined;
  const held = !!g && g.alive;
  const was = cur ? cur.buried : null;
  const ok = !prior && !!cur && cur.buried === !bury && (!bury || !held);
  if (ok && cur) cur.buried = bury;
  const nonce = S(o.nonce);
  if (!prior) f.ops.set(op, { state: ok ? "done" : "failed", qty: 0, result: { nonce }, kind: "flip" });
  const mine = !prior || (prior.result as { nonce?: string } | null)?.nonce === nonce;
  return row({ state: prior?.state ?? (ok ? "done" : "failed"), here: !!cur, buried: was, held, mine });
}

function flipFence(o: O) {
  const op = S(o.op);
  if (!f.ops.has(op)) f.ops.set(op, { state: "failed", qty: 0, result: null, kind: "flip" });
  return row({ state: f.ops.get(op)?.state });
}

export const liftCmds: Record<string, (o: O) => unknown[]> = { snap, pickup, flip, flipFence };
