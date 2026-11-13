// Фейк входа (§8.23) поверх фейка сундука (plain-chest/pchest.fake): открыть
// (цена не меньше 1, списание энергии, повтор нажатия, живой вход, цена выше
// показанной) и закрыть — по смыслу SQL pass-sql. Цена — строкой, как её
// собирает pass.ts: «1» у мешочка, «CELLS:<таблица>|<условие>» у сундука (мок
// cellsPriceSql). Повтор того же нажатия или живой вход — без платы и без
// записи; закрыть — погасить срок (только свои ключи нажатий, если они есть),
// ключ нажатия остаётся.
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { hexDistance } from "@/lib/raid/hex";
import { chestOpenPrice } from "@/lib/openPass";
import { energyOf, f, slotsOf } from "@/server/api/beta-raid/plain-chest/pchest.fake";

type O = Record<string, unknown>;
const row = (v: unknown) => [{ _row: v }];
const S = (v: unknown) => String(v);
const cells = (counts: number[]) =>
  counts.reduce((n, c) => n + (c > 0 ? Math.ceil(c / CELL_SIZE) : 0), 0);

/** Цена в миг открытия: занятые ячейки обычного сундука или сети владельца, не меньше 1. */
function priceOf(sql: string): number {
  if (!sql.startsWith("CELLS:")) return Number(sql) || 0;
  const id = /'([^']+)'/.exec(sql)?.[1] ?? "";
  if (sql.includes("raid_plain_chest_slot")) {
    return chestOpenPrice(cells([...slotsOf(id).values()].map((s) => s.count)));
  }
  return chestOpenPrice(cells([...(f.net.get(id)?.values() ?? [])]));
}

function open(o: O) {
  const [acc, wallet, target, op] = [S(o.account), S(o.wallet), S(o.target), S(o.op)];
  const key = `${acc}|${target}`;
  const ver = f.ver.get(acc) ?? 0;
  const pos = [...f.accounts].find(([, a]) => a === acc)?.[0];
  const at = pos ? f.pos.get(pos) : undefined;
  const cell = o.cell as { q: number; r: number };
  const near = !!at && hexDistance(at.q, at.r, cell.q, cell.r) <= 1;
  const cur = f.passes.get(key);
  // Даром и без записи: повтор того же нажатия или вход ещё жив.
  const free = !!cur && (cur.op === op || (cur.until > f.clock && cur.ver === ver));
  const price = priceOf(S(o.priceSql));
  const max = typeof o.maxPrice === "number" ? o.maxPrice : Infinity;
  const go = near && !free && price <= max;
  let paid = 0;
  if (go && price > 0) {
    const have = energyOf(wallet);
    // Как touch_energy_atomic: нехватка — исключение, транзакция назад целиком.
    if (have < price) throw new Error(`not_enough_energy:${have}:${price}`);
    f.energy.set(wallet, have - price);
    paid = price;
  }
  if (go) f.passes.set(key, { until: f.clock + 600_000, ver, op, cost: paid, at: f.clock });
  return row({ near, free, paid, price, until: go || free ? "later" : null });
}

function close(o: O) {
  const acc = S(o.account);
  const bagIds = (o.bagIds as string[]) ?? [];
  const ops = (o.ops as string[] | undefined) ?? [];
  const withChest = o.chest !== false;
  const chest = f.chests.get(`${o.q},${o.r}`);
  const drop = new Set([
    ...(withChest ? [`mc:${o.mapId}:${o.q}:${o.r}`] : []),
    ...bagIds.map((id) => `lb:${id}`),
    ...(withChest && chest ? [`pc:${chest.id}`] : []),
  ]);
  // Срок гаснет, ключ нажатия остаётся: опоздавший повтор моста не заплатит.
  for (const t of drop) {
    const p = f.passes.get(`${acc}|${t}`);
    if (p && p.until > f.clock && (ops.length === 0 || ops.includes(p.op))) p.until = f.clock;
  }
  return [];
}

export const passCmds: Record<string, (o: O) => unknown[]> = { open, close };
