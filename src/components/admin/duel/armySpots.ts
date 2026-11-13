// Своя армия до боя (владелец 09.11.2026: «где список всех моих бойцов, кто решил,
// что именно эти и только 2 — может быть до 4; где режим изначально расставить»):
// где стоят ваши бойцы — по герою и шаблону моба, а не по порядку в списке: убрал
// одного — остальные стоят где стояли; новый встаёт на первую свободную клетку зоны.
import { inDeployZone } from "@/lib/duel/engine";
import { key } from "@/lib/duel/grid";
import { COLS, ROWS, type DuelState, type Pos, type Side, type Unit } from "@/lib/duel/types";

export type Spots = Record<string, Pos>;

/** Ключ места: «hero» или «шаблон:копия» (unit.id = «a:<шаблон>:<копия>»). */
export const spotKey = (u: Unit): string =>
  u.kind === "hero" ? "hero" : u.id.split(":").slice(1).join(":");

/** Клетки зоны стороны в порядке занятия новыми: ближе к центру ряда, дальше от края поля. */
function zoneCells(side: Side): Pos[] {
  const out: Pos[] = [];
  const cols = side === "a" ? [1, 0] : [COLS - 2, COLS - 1];
  const rows = [3, 4, 2, 5, 1, 6, 0, 7].filter((r) => r < ROWS);
  for (const c of cols) for (const r of rows) out.push({ c, r });
  return out.filter((p) => inDeployZone(side, p.c));
}

/** Поставить бойцов стороны на их места; без места или место занято — первая свободная клетка зоны. */
export function withSpots(st: DuelState, side: Side, spots: Spots): DuelState {
  const mine = st.units.filter((u) => u.side === side);
  const taken = new Set(st.obstacles.map(key));
  for (const u of st.units) if (u.side !== side) taken.add(key(u.pos));
  const units = st.units.map((u) => ({ ...u, pos: { ...u.pos } }));
  const byId = new Map(units.map((u) => [u.id, u]));
  const placed = new Set<string>();
  for (const u of mine) {
    const p = spots[spotKey(u)];
    if (!p || !inDeployZone(side, p.c) || taken.has(key(p))) continue;
    (byId.get(u.id) as Unit).pos = { ...p };
    taken.add(key(p));
    placed.add(u.id);
  }
  for (const u of mine) {
    if (placed.has(u.id)) continue;
    const own = byId.get(u.id) as Unit;
    const free = taken.has(key(own.pos))
      ? zoneCells(side).find((p) => !taken.has(key(p)))
      : own.pos;
    if (!free) continue;
    own.pos = { ...free };
    taken.add(key(free));
  }
  return { ...st, units };
}

/** Места бойцов стороны из состояния (после перестановки на поле). */
export function spotsOf(st: DuelState, side: Side): Spots {
  const out: Spots = {};
  for (const u of st.units) if (u.side === side) out[spotKey(u)] = { ...u.pos };
  return out;
}
