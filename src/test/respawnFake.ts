// Фейк базы для респавна декора (decor-respawn.test): клетки карты, очередь
// raid_decor_respawn и занятость клеток.
//
// Оператор разбора выполняется целиком и за раз — как Postgres под локом
// `decor-respawn`: созревшие и ещё не вставшие по сроку, не больше BATCH,
// вердикт по правилам шапки decor-respawn.ts (их же держит SQL — сверено
// SELECT-ом на живой базе). Чужой оператор — ошибка теста, а не молчание.
export type Cell = {
  terrain: string | null;
  road: string | null;
  building: string | null;
  object: string | null;
  group: string | null;
  decor: string | null;
};
export type Row = Omit<Cell, "decor"> & { decor: string; due: number; placed: number | null };

const BATCH = 200;

export const fake = {
  now: 0,
  cells: new Map<string, Cell>(),
  rows: new Map<string, Row>(),
  /** Клетки, где стоит игрок, корабль, беглец или стоящий сундук. */
  busy: new Set<string>(),
  /** Клетки с мешочком или бугорком (рост не держат, но слой перечитать). */
  covered: new Set<string>(),
  /** Удалённые шаблоны декора. */
  dead: new Set<string>(),
  /** Мост применил разбор, но ответ потерялся. */
  loseSweep: false,
  sql: [] as string[],
};

export const K = (m: string, q: number, r: number) => `${m}:${q}:${r}`;
const iso = (ms: number) => new Date(ms).toISOString();
const num = (sql: string, re: RegExp) => Number(re.exec(sql)?.[1]);

export const cell = (over: Partial<Cell> = {}): Cell => ({
  terrain: "grass",
  road: null,
  building: null,
  object: null,
  group: null,
  decor: null,
  ...over,
});

export function resetFake(): void {
  Object.assign(fake, {
    now: Date.parse("2026-09-28T12:00:00Z"),
    cells: new Map([["m:1:0", cell()]]),
    rows: new Map(),
    busy: new Set(),
    covered: new Set(),
    dead: new Set(),
    loseSweep: false,
    sql: [],
  });
}

function schedule(sql: string): unknown[] {
  const m = /c\.map_id = '([^']+)'/.exec(sql)![1];
  const [q, r] = [num(sql, /c\.q = (-?\d+)/), num(sql, /c\.r = (-?\d+)/)];
  const decor = /SELECT c\.map_id, c\.q, c\.r, '([^']+)'/.exec(sql)![1];
  const c = fake.cells.get(K(m, q, r));
  const due = fake.now + num(sql, /mins => (\d+)/) * 60_000;
  if (c) fake.rows.set(K(m, q, r), { ...c, decor, due, placed: null });
  return [];
}

/** Разбор: созревшие по сроку — поставить, отложить на минуту или снять. */
function sweep(): void {
  const due = [...fake.rows]
    .filter(([, row]) => row.placed === null && row.due <= fake.now)
    .sort((a, b) => a[1].due - b[1].due)
    .slice(0, BATCH);
  for (const [k, row] of due) {
    const c = fake.cells.get(k);
    const changed =
      !c ||
      fake.dead.has(row.decor) ||
      c.terrain === null ||
      c.decor !== null ||
      c.terrain !== row.terrain ||
      c.road !== row.road ||
      c.building !== row.building ||
      c.group !== row.group ||
      (c.object !== null && c.object !== row.object);
    if (changed) fake.rows.delete(k);
    else if (fake.busy.has(k)) row.due = fake.now + 60_000;
    else {
      c.decor = row.decor;
      row.placed = fake.now;
    }
  }
}

function placed(): unknown[] {
  return [...fake.rows]
    .filter(([, row]) => row.placed !== null)
    .map(([k, row]) => {
      const [map_id, q, r] = k.split(":");
      const c = fake.cells.get(k);
      const at = iso(row.placed!);
      const covered = fake.covered.has(k);
      return { map_id, q: +q, r: +r, placed_at: at, here: !!c, decoration_id: c?.decor ?? null, covered };
    });
}

function sent(sql: string): unknown[] {
  for (const m of sql.matchAll(/\('([^']+)', (-?\d+), (-?\d+), '([^']+)'::timestamptz\)/g)) {
    const k = K(m[1], Number(m[2]), Number(m[3]));
    const row = fake.rows.get(k);
    if (row && row.placed !== null && iso(row.placed) === m[4]) fake.rows.delete(k);
  }
  return [];
}

/** mcpExec фейка. */
export function respawnDb(sql: string): unknown[] {
  fake.sql.push(sql);
  if (sql.includes("INSERT INTO yuplink.raid_decor_respawn")) return schedule(sql);
  if (sql.includes("hashtext('decor-respawn')")) {
    sweep();
    if (fake.loseSweep) {
      fake.loseSweep = false;
      throw new Error("MCP timeout");
    }
    return [{ _row: { placed: 0, waiting: 0, gone: 0 } }];
  }
  if (sql.includes("WHERE d.placed_at IS NOT NULL")) return placed();
  if (sql.includes("DELETE FROM yuplink.raid_decor_respawn d")) return sent(sql);
  if (sql.includes("SELECT q, r, decoration_id FROM yuplink.raid_map_cells")) {
    const m = /map_id = '([^']+)'/.exec(sql)![1];
    return [...sql.matchAll(/\((-?\d+), (-?\d+)\)/g)]
      .map(([, q, r]) => ({ q: +q, r: +r, c: fake.cells.get(K(m, +q, +r)) }))
      .filter((x) => x.c)
      .map((x) => ({ q: x.q, r: x.r, decoration_id: x.c!.decor }));
  }
  if (sql.includes("SELECT id, name, image_url FROM yuplink.mystic_item_template")) {
    return [{ id: "decoration_pine", name: "Ёлка", image_url: "/pine.png" }];
  }
  throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
}
