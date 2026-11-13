// Фейк «Копать» на пустой земле для main-tool.fake (§8.24 п. 6–6б): клетки,
// ключи нажатий (с находкой), ямки и настройка находок. Операторы узнаются по
// тексту и исполняются по смыслу — как Postgres под локом ключа нажатия.
/** Клетка карты для «Копать»: что на ней (всё, что мешает, — true). */
export type FakeCell = Partial<
  Record<"water" | "decor" | "building" | "object" | "bag" | "chest" | "ship", boolean>
> & {
  terrain?: boolean;
};

export const gx = {
  cells: new Map<string, FakeCell>(),
  /** raid_loot_bag_op: ключ копки → исход, nonce и находка. */
  digOps: new Map<string, { state: string; nonce: string | null; item: string | null }>(),
  /** Свежие ямки «q,r» (час). */
  holes: new Set<string>(),
  /** Ямку на этой клетке поставит «другой» между проверкой и записью. */
  stealOnMark: null as string | null,
  /** Строка settings dig_config (текст) или null. */
  digConfig: null as string | null,
};

export function resetGround(): void {
  Object.assign(gx, {
    cells: new Map(),
    digOps: new Map(),
    holes: new Set(),
    stealOnMark: null,
    digConfig: null,
  });
}

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
const row = (v: unknown) => [{ _row: v }];

function cell(sql: string): unknown[] {
  const at = /c\.q = (-?\d+) AND c\.r = (-?\d+)/.exec(sql);
  const key = `${at?.[1]},${at?.[2]}`;
  const c = gx.cells.get(key);
  if (!c) return [];
  const { terrain = true, ...rest } = c;
  return [
    {
      ok: terrain && !Object.values(rest).some(Boolean),
      hole: gx.holes.has(key),
      terrain: terrain ? "terrain_t1" : null,
    },
  ];
}

function mark(sql: string): unknown[] {
  const op = pick(sql, /WHERE op = '([^']+)'/);
  const prior = gx.digOps.get(op);
  if (sql.includes("'ground', 'failed'")) {
    if (!prior) gx.digOps.set(op, { state: "failed", nonce: null, item: null });
    const cur = gx.digOps.get(op)!;
    return row({ state: cur.state, nonce: cur.nonce, item: cur.item });
  }
  const nonce = pick(sql, /jsonb_build_object\('nonce', '([^']+)'/);
  const item = pick(sql, /'item', '([^']+)'::text/) || null;
  if (prior) return row({ state: prior.state, mine: prior.nonce === nonce, item: prior.item });
  const at = /SELECT '[^']+', (-?\d+), (-?\d+), now\(\)/.exec(sql);
  const key = `${at?.[1]},${at?.[2]}`;
  if (gx.stealOnMark === key) gx.holes.add(key);
  if (gx.holes.has(key)) return row({ state: null, mine: false, item: null });
  gx.holes.add(key);
  gx.digOps.set(op, { state: "done", nonce, item });
  return row({ state: "done", mine: true, item });
}

/** Оператор копки — его ответ; чужой — null. */
export function groundRun(sql: string): unknown[] | null {
  if (sql.includes("FROM yuplink.raid_map_cells c") && sql.includes("AS ok")) return cell(sql);
  if (sql.includes("'ground', 'done'") || sql.includes("'ground', 'failed'")) return mark(sql);
  if (sql.includes("SELECT state, parts->>'item' AS item FROM yuplink.raid_loot_bag_op")) {
    const o = gx.digOps.get(pick(sql, /WHERE op = '([^']+)'/));
    return o ? [{ state: o.state, item: o.item }] : [];
  }
  if (sql.includes("WHERE key = 'dig_config'"))
    return gx.digConfig ? [{ value: gx.digConfig }] : [];
  return null;
}
