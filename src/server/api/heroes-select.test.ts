// Выбор основного героя: занятый (отдыхает после снятия с грядки или батрачит)
// основным не встаёт, и отказ приходит ДО снятия отметки с прежнего основного —
// иначе игрок оставался бы вовсе без героя.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  resting: false,
  busy: false,
  /** Занятым он становится между проверкой и записью. */
  raceBusy: false,
  selected: "hero_main" as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("AS resting")) {
      const late = s.raceBusy && s.sql.some((x) => x.includes("SET selected_at = CASE"));
      return [{ resting: s.resting || late, busy: s.busy }];
    }
    if (sql.includes("SELECT id FROM yuplink.hero_instance"))
      return s.selected ? [{ id: s.selected }] : [];
    if (sql.includes("SET selected_at = NULL")) {
      s.selected = null;
      return [];
    }
    if (sql.includes("SET selected_at = CASE WHEN h.id =")) {
      // Одна смена под замком героя: занятый (гонка) — не назначен, прежний цел.
      if (s.raceBusy) return [{ _row: { chosen: false } }];
      s.selected = /CASE WHEN h\.id = '([^']+)'/.exec(sql)?.[1] ?? null;
      return [{ _row: { chosen: true } }];
    }
    return [];
  },
}));
vi.mock("../auth", () => ({ requireWallet: () => "w_me" }));
vi.mock("./user", () => ({ accountOf: async () => "acc_me" }));
vi.mock("./beta-raid/castle", () => ({ requireAtCastle: async () => {} }));
vi.mock("./beta-raid/hero-power", () => ({
  heroPowerEnabled: async () => true,
  invalidateHeroPower: () => {},
}));
vi.mock("../accountBalances", () => ({ getAccountId: async () => null }));

const { selectMyHero } = await import("./heroes-select");
const pick = selectMyHero as unknown as (a: {
  data: { heroId: string | null };
}) => Promise<{ ok: true; heroId: string | null }>;

beforeEach(() => {
  s.sql = [];
  s.resting = s.busy = s.raceBusy = false;
  s.selected = "hero_main";
});

describe("selectMyHero — занятый герой", () => {
  it("отдыхает — «герой отдыхает», прежний основной на месте", async () => {
    s.resting = true;
    await expect(pick({ data: { heroId: "hero_w" } })).rejects.toThrow("braid.hero_resting");
    expect(s.selected).toBe("hero_main");
    expect(s.sql.some((x) => x.includes("SET selected_at = NULL"))).toBe(false);
  });

  it("батрачит — прежний отказ грядки, прежний основной на месте", async () => {
    s.busy = true;
    await expect(pick({ data: { heroId: "hero_w" } })).rejects.toThrow("braid.field_hero_busy");
    expect(s.selected).toBe("hero_main");
  });

  it("свободен — становится основным одной сменой с условием «свободен»", async () => {
    await expect(pick({ data: { heroId: "hero_w" } })).resolves.toMatchObject({ heroId: "hero_w" });
    const set = s.sql.find((x) => x.includes("SET selected_at = CASE")) ?? "";
    expect(set).toContain("x.rest_until IS NULL OR x.rest_until <= now()");
    expect(set).toContain("fw.hero_id = x.id");
    // Замок героя — отдельным оператором перед сменой (как у постановки на грядку).
    expect(set).toContain("pg_advisory_xact_lock(hashtext('hero:hero_w')) AS l;");
    // Прежнего основного отдельным запросом не снимали — только внутри смены.
    expect(s.sql.some((x) => x.includes("SET selected_at = NULL"))).toBe(false);
  });

  it("стал занятым между проверкой и записью — причина названа, прежний основной на месте", async () => {
    s.raceBusy = true;
    await expect(pick({ data: { heroId: "hero_w" } })).rejects.toThrow("braid.hero_resting");
    expect(s.selected).toBe("hero_main");
  });
});
