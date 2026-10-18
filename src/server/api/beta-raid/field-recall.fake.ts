// Подставная база для тестов снятия с грядки издалека (field-recall*.test.ts).
//
// Журнал поля, рабочий герой и его отдых живут в памяти. Флаги состояния
// изображают сбои моста и гонки: повтор после коммита, снимок до замка, сбой
// оператора до и после записи.
type Fn = (ctx: { data: unknown }) => unknown;
type Cell = { q: number; r: number };

const fresh = () => ({
  hero: { id: "hero_w", owner: "acc_me", name: "Воин" },
  worker: { heroId: "hero_w" as string | null, account: "acc_me", accrued: 0.4 },
  field: true,
  pos: { q: 0, r: 0 } as Cell | null,
  journal: new Map<string, number>(),
  /** Отдых, записанный тем же оператором, что и снятие: мс и чей. */
  rest: null as { heroId: string; ms: number } | null,
  /** Сколько раз оператор снятия записал отдых (повтор не должен продлевать). */
  restWrites: 0,
  /** Отдыхающий снят с основных тем же оператором. */
  deselected: false,
  /** Кэш силы героя сброшен (основной мог смениться). */
  powerReset: 0,
  casThrows: false,
  casCommitThenThrow: false,
  casRetryAfterCommit: false,
  casStaleSnapshot: false,
  onField: null as null | (() => void),
  published: 0,
  dust: 0,
});
export const s = fresh();
export const resetFake = () => Object.assign(s, fresh());

export const reactStart = {
  createServerFn: () => {
    const wrap = (fn: Fn, validate?: (d: unknown) => unknown) => (a: { data: unknown }) =>
      fn({ data: validate ? validate(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({
        handler: (fn: Fn) => wrap(fn, validate),
      }),
    };
  },
};

export const move = { accAccountId: async () => "acc_me" };

/** CAS-снятие: условие по герою, ключ снятия и отдых берём прямо из SQL. */
function cas(sql: string): unknown[] {
  if (s.casThrows) throw new Error("MCP POST 502");
  const w = s.worker;
  const lv = /SELECT '([^']+)', accrued FROM up/.exec(sql)?.[1] ?? "";
  const want = /w\.hero_id = '([^']+)'/.exec(sql)?.[1] ?? null;
  const hit = w.heroId !== null && (want === null || w.heroId === want);
  if (hit) {
    w.heroId = null;
    s.journal.set(lv, w.accrued);
    // Отдых — тем же оператором и только если героя сняли именно им.
    const ms = /interval '(\d+) milliseconds'/.exec(sql)?.[1];
    const who = /WHERE h\.id = '([^']+)' AND EXISTS \(SELECT 1 FROM up\)/.exec(sql)?.[1];
    if (ms && who) {
      s.rest = { heroId: who, ms: Number(ms) };
      s.restWrites++;
      if (sql.includes("selected_at = NULL")) s.deselected = true;
    }
  }
  if (hit && s.casCommitThenThrow) throw new Error("MCP POST 502");
  // Повтор догнал незакрытую первую попытку: её ключ в его снимок не попал.
  if (hit && s.casStaleSnapshot) return [{ removed: 0, accrued: null, prior: null }];
  // Повтор моста после коммита видит уже снятого героя и свой ключ.
  if (hit && !s.casRetryAfterCommit) return [{ removed: 1, accrued: w.accrued, prior: null }];
  return [{ removed: 0, accrued: null, prior: s.journal.get(lv) ?? null }];
}

export const mcp = {
  mcpExec: async (sql: string): Promise<unknown[]> => {
    const w = s.worker;
    const key = /op = '([^']+)'/.exec(sql)?.[1] ?? "";
    if (sql.includes("FROM yuplink.hero_instance h")) {
      if (!sql.includes(`h.id = '${s.hero.id}'`)) return [];
      const works = w.heroId === s.hero.id && sql.includes(`w.account_id = '${w.account}'`);
      const at = works ? { map_id: "rmap_a", q: 30, r: 90 } : { map_id: null, q: null, r: null };
      return [{ owner: s.hero.owner, name: s.hero.name, ...at }];
    }
    if (sql.includes("INSERT INTO yuplink.raid_field_op AS o")) {
      const [, k, mark] = /VALUES \('([^']+)', (\d+)\)/.exec(sql) ?? [];
      if (!s.journal.has(k)) s.journal.set(k, Number(mark));
      return [{ mark: String(s.journal.get(k)) }];
    }
    if (sql.includes("DELETE FROM yuplink.raid_field_op")) {
      const mark = Number(/units = (\d+)/.exec(sql)?.[1]);
      if (s.journal.get(key) === mark) s.journal.delete(key);
      return [];
    }
    if (sql.includes("SET hero_id = NULL")) return cas(sql);
    if (sql.includes("SELECT units::float8 AS units FROM yuplink.raid_field_op")) {
      return s.journal.has(key) ? [{ units: s.journal.get(key) }] : [];
    }
    return [];
  },
};

export const where = {
  myMapId: async () => "rmap_a",
  ownCell: async () => s.pos,
};

export const building = {
  loadCellBuilding: async () => {
    s.onField?.();
    return s.field
      ? {
          effect: "field",
          tier: 1,
          tiers: [{}, {}],
          config: {
            field: { reward: { kind: "item", itemId: "cst_apple", name: "Яблоко" }, yield: 2 },
          },
          meta: null,
        }
      : null;
  },
};

export const settle = { settleFieldPayout: async () => {}, WAREHOUSE_RADIUS: 3 };

export const warehouse = {
  nearestWarehouse: async () => ({ q: 31, r: 90 }),
  creditItemToWarehouse: async (o: { units: number }) => {
    s.dust += o.units;
    return { failed: 0, rejected: 0 };
  },
};

export const live = { publishRaid: () => void s.published++ };

export const heroPower = { invalidateHeroPower: () => void s.powerReset++ };
