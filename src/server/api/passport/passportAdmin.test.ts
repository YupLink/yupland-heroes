// Паспорт аккаунта: строка сводится верно, «два аккаунта на Telegram» — только по
// настоящему Telegram, поиск не пускает в запрос кавычки и подстановки.
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (h: unknown) => h }),
    handler: (h: unknown) => h,
  }),
}));
vi.mock("../../auth", () => ({ requireAdmin: () => {} }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

const { PASSPORT_CTE, SUMMARY_SQL, listSql, passportFilter, toRow } =
  await import("./passportAdmin");
const { GOOGLE_TG_BASE, WALLET_TG_BASE } = await import("@/lib/auth/googleTg");

describe("паспорт аккаунта", () => {
  it("строка: Telegram, кошельки с подписью/без, близнецы без самого себя", () => {
    const row = toRow({
      id: "acc_a",
      lastSeenAt: "2026-11-06T10:00:00Z",
      tg: "700000001",
      syn: null,
      username: "owner_tg",
      wallets: [
        { wallet: "owner.tg", signed: false, off: false },
        { wallet: "x.near", signed: true, off: true },
      ],
      google: null,
      ids: ["acc_a", "acc_b"],
    });
    expect(row.tg).toBe("700000001");
    expect(row.noTg).toBeNull();
    expect(row.wallets).toEqual([
      { wallet: "owner.tg", signed: false, off: false },
      { wallet: "x.near", signed: true, off: true },
    ]);
    expect(row.twins).toEqual(["acc_b"]);
  });

  it("без Telegram: номер входа по кошельку и Google различаются", () => {
    const base = { id: "acc_x", tg: null, wallets: [], ids: [] };
    expect(toRow({ ...base, syn: String(WALLET_TG_BASE + 3) }).noTg).toBe("wallet");
    expect(toRow({ ...base, syn: String(GOOGLE_TG_BASE + 1), google: "a@b.c" }).noTg).toBe(
      "google",
    );
    expect(toRow({ ...base, syn: null }).noTg).toBeNull();
    expect(toRow({ id: "acc_y" }).wallets).toEqual([]);
  });

  it("настоящий Telegram — ниже 2^52; синтетика tg<id> не считается кошельком", () => {
    expect(PASSPORT_CTE).toContain(`telegram_id < ${GOOGLE_TG_BASE}`);
    expect(PASSPORT_CTE).toContain("wallet !~ '^tg[0-9]+$'");
    expect(PASSPORT_CTE).toMatch(/GROUP BY tg HAVING count\(\*\) > 1/);
    expect(SUMMARY_SQL).toContain('"twinTg"');
  });

  it("режимы и поиск", () => {
    expect(listSql("recent", "")).not.toContain("WHERE cardinality");
    expect(listSql("twins", "")).toContain("WHERE cardinality(ids) > 1");
    const s = listSql("twins", "Ownernick");
    expect(s).toContain("LIKE '%ownernick%'");
    expect(s).toContain("cardinality(ids) > 1 AND lower(");
  });

  it("поиск: кавычки, проценты и точка с запятой не проходят", () => {
    expect(passportFilter.parse({}).mode).toBe("recent");
    expect(passportFilter.parse({ q: " ivan@gmail.com " }).q).toBe("ivan@gmail.com");
    expect(passportFilter.parse({ q: "Ангелина" }).q).toBe("Ангелина");
    for (const bad of ["a'b", "50%", "x; drop", 'a"b'])
      expect(() => passportFilter.parse({ q: bad })).toThrow();
    expect(() => passportFilter.parse({ mode: "all" })).toThrow();
  });
});
