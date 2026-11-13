// Ручки расстановки замка поверх фейковой таблицы castle_layout: чтение пустого,
// первая запись 0 → 1, следующая, конфликт (ответ — актуальное, без записи),
// чужой аккаунт не виден, права и отказы до записи; миграция — идемпотентна.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
type Row = { revision: number; layout: string; wallet: string };
const s = vi.hoisted(() => ({
  account: "acc_me",
  wallet: "w_me",
  admins: [] as string[],
  username: null as string | null,
  owned: {} as Record<
    string,
    { legacy?: Record<string, boolean>; decor?: string[]; kinds?: string[] }
  >,
  table: new Map<string, { revision: number; layout: string; wallet: string }>(),
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/auth", () => ({
  isAdminWallet: (w: string) => s.admins.includes(w),
  isCastleEditor: (w: string, u: string | null) => s.admins.includes(w) || u === "designer_tg",
}));
vi.mock("@/server/db/pg", () => ({
  pg: { users: { findOne: async () => ({ telegram_username: s.username }) } },
}));
vi.mock("@/server/api/castle-townhall/townhall-state", () => ({
  who: async () => ({ wallet: s.wallet, account: s.account }),
  loadTownHall: async (account: string) => {
    const o = s.owned[account] ?? {};
    return {
      level: 1,
      purchased: 0,
      buildings: (o.kinds ?? []).map((kind, i) => ({
        id: `cb_${i}`,
        kind,
        source: "buy",
        createdAt: "",
      })),
      legacy: { casino: false, auction: false, architect: false, ...o.legacy },
      decor: o.decor ?? [],
      resources: {},
    };
  },
}));
// Фейковая таблица: понимает ровно три оператора из layout-sql.ts.
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    const acc = /account_id = '([^']*)'/.exec(sql)?.[1] ?? "";
    if (sql.startsWith("SELECT revision, layout")) {
      const r = s.table.get(acc);
      return r ? [{ revision: r.revision, layout: JSON.parse(r.layout) }] : [];
    }
    const json = /'((?:[^']|'')*)'::jsonb/.exec(sql)![1].replace(/''/g, "'");
    const wallet = /updated_wallet = '([^']*)'|now\(\), '([^']*)'\)/
      .exec(sql)!
      .slice(1)
      .find(Boolean)!;
    if (sql.startsWith("INSERT")) {
      const ins = /VALUES \('([^']*)', 1,/.exec(sql)![1];
      if (s.table.has(ins)) return [];
      s.table.set(ins, { revision: 1, layout: json, wallet });
      return [{ revision: 1 }];
    }
    const rev = Number(/AND revision = (\d+)/.exec(sql)![1]);
    const r = s.table.get(acc);
    if (!r || r.revision !== rev) return [];
    s.table.set(acc, { revision: rev + 1, layout: json, wallet });
    return [{ revision: rev + 1 }];
  },
}));

const { getCastleLayout, saveCastleLayout } = await import("./castle-layout");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const get = () => call(getCastleLayout) as Promise<{ revision: number; layout: unknown[] | null }>;
const save = (revision: number, layout: unknown[], extra: Record<string, unknown> = {}) =>
  call(saveCastleLayout, { revision, layout, ...extra }) as Promise<Record<string, unknown>>;
const err = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: Error) => e.message,
  );
const writes = () => s.sql.filter((q) => /^(INSERT|UPDATE)/.test(q));

const item = (id: string, x = 400, extra: Record<string, unknown> = {}) => ({
  id,
  x,
  y: 700,
  size: 220,
  caption: { x: 0, y: -8, font: 12, height: 23 },
  captionHidden: false,
  mirrored: false,
  ...extra,
});
const phone = [item("hall", 375), item("gates", 400, { y: 330, roadStyle: "base" })];
const pc = [item("hall", 500), item("gates", 420, { y: 330 })];
const well = item("decor:1", 300, { decor: true, catalogId: "well", baseSize: 180, size: 180 });

beforeEach(() => {
  Object.assign(s, {
    account: "acc_me",
    wallet: "w_me",
    admins: [],
    username: null,
    owned: {},
    sql: [],
  });
  s.table = new Map<string, Row>();
});

describe("getCastleLayout", () => {
  it("нет строки — ревизия 0 и null; чтение ничего не пишет", async () => {
    expect(await get()).toEqual({ revision: 0, layout: null });
    expect(writes()).toEqual([]);
    expect(s.sql[0]).toContain("WHERE account_id = 'acc_me'");
  });
});

describe("saveCastleLayout", () => {
  it("первая запись: ревизия 0 → 1, сцена сохранена целиком, кошелёк сессии", async () => {
    expect(await save(0, phone)).toEqual({ ok: true, revision: 1 });
    expect(await get()).toEqual({ revision: 1, layout: phone });
    expect(s.table.get("acc_me")?.wallet).toBe("w_me");
  });
  it("обычная запись поверх своей ревизии: 1 → 2", async () => {
    await save(0, phone);
    expect(await save(1, pc)).toEqual({ ok: true, revision: 2 });
    expect(await get()).toEqual({ revision: 2, layout: pc });
  });
  it("конфликт: старая ревизия — в ответе актуальное, ничего не перезаписано", async () => {
    await save(0, phone);
    await save(
      1,
      phone.map((b) => ({ ...b, x: b.x + 10 })),
    );
    const fresh = s.table.get("acc_me");
    const r = await save(1, pc);
    expect(r).toEqual({
      ok: false,
      conflict: true,
      revision: 2,
      layout: JSON.parse(fresh!.layout),
    });
    expect(s.table.get("acc_me")).toEqual(fresh);
  });
  it("второе устройство с ревизией 0, когда первое уже сохранило, — конфликт", async () => {
    await save(0, phone);
    expect(await save(0, pc)).toEqual({ ok: false, conflict: true, revision: 1, layout: phone });
    expect(s.table.get("acc_me")?.revision).toBe(1);
  });
  it("ревизия на сервере есть, а строки нет — конфликт с ревизией 0", async () => {
    expect(await save(5, pc)).toEqual({ ok: false, conflict: true, revision: 0, layout: null });
    expect(s.table.size).toBe(0);
  });
  it("запись — одним оператором с проверкой ревизии", async () => {
    await save(0, phone);
    await save(1, pc);
    expect(writes()[0]).toMatch(/ON CONFLICT \(account_id\) DO NOTHING\s+RETURNING revision$/);
    expect(writes()[1]).toMatch(
      /WHERE account_id = 'acc_me' AND revision = 1\s+RETURNING revision$/,
    );
  });
  it("чужой аккаунт не виден, аккаунт из входа не слушаем", async () => {
    await save(0, phone);
    s.account = "acc_other";
    s.wallet = "w_other";
    expect(await get()).toEqual({ revision: 0, layout: null });
    expect(await save(0, pc, { account: "acc_me", wallet: "w_me" })).toEqual({
      ok: true,
      revision: 1,
    });
    expect(s.table.get("acc_other")).toMatchObject({ revision: 1, wallet: "w_other" });
    expect(JSON.parse(s.table.get("acc_me")!.layout)).toEqual(phone);
  });
  it("плохие данные — отказ ключом, до базы", async () => {
    expect(await err(save(0, [item("hall", Number.NaN)]))).toBe(
      'castle.layout_bad|{"at":"layout.0.x"}',
    );
    expect(s.sql).toEqual([]);
  });
  it("не купленное — отказ ключом, ничего не записано", async () => {
    expect(await err(save(0, [...phone, item("casino", 770)]))).toBe(
      'castle.layout_not_owned|{"id":"casino"}',
    );
    expect(await err(save(0, [...phone, well]))).toBe('castle.layout_not_owned|{"id":"well"}');
    expect(writes()).toEqual([]);
  });
  it("купленное проходит: здание и вид декора аккаунта", async () => {
    s.owned.acc_me = { legacy: { casino: true }, kinds: ["mine_office"], decor: ["well"] };
    const layout = [...phone, item("casino", 770), item("mine_office", 830), well];
    expect(await save(0, layout)).toEqual({ ok: true, revision: 1 });
  });
  it("дизайнер замка — весь декор; админу Казино и без постройки", async () => {
    s.username = "designer_tg";
    expect(await save(0, [...phone, well])).toEqual({ ok: true, revision: 1 });
    s.username = null;
    s.admins = ["w_me"];
    expect(await save(1, [...phone, well, item("casino", 770)])).toEqual({ ok: true, revision: 2 });
  });
});

describe("миграция castle-layout-01", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../../migrations/castle-layout-01.sql", import.meta.url)),
    "utf8",
  );
  it("одной транзакцией, повтор безвреден", () => {
    expect(sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/);
  });
  it("колонки — как в ручках", () => {
    for (const col of [
      "account_id text PRIMARY KEY",
      "revision bigint NOT NULL CHECK (revision >= 1)",
      "layout jsonb NOT NULL",
      "updated_at timestamptz NOT NULL DEFAULT now()",
      "updated_wallet text",
    ])
      expect(sql).toContain(col);
  });
});
