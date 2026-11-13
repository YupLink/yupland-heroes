// Админка промокодов: requireAdmin до базы, строки (диапазон, ссылка, USDT,
// потолок штучного), токен — только владельцу и только с объёмом, ссылка —
// есть в своём справочнике.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a, call, goodLine, input, resetAdminFake } from "./promo-admin.fake";

vi.mock("@tanstack/react-start", async () => (await import("./promo-admin.fake")).serverFn);
vi.mock("@/server/auth", async () => (await import("./promo-admin.fake")).auth);
vi.mock("@/server/db/mcpClient", async () => (await import("./promo-admin.fake")).mcp);
vi.mock("@/server/api/mystic-money", async () => (await import("./promo-admin.fake")).money);

const api = await import("./promo-admin");
const create = (over: Record<string, unknown> = {}) => call(api.adminCreatePromo, input(over));
const withLine = (line: Record<string, unknown>) => create({ lines: [{ ...goodLine, ...line }] });

beforeEach(resetAdminFake);

describe("доступ", () => {
  it("не админ — отказ на каждой ручке, база не тронута", async () => {
    a.admin = false;
    await expect(create()).rejects.toThrow("admin");
    await expect(call(api.adminListPromos, { limit: 50 })).rejects.toThrow("admin");
    await expect(call(api.adminTogglePromo, { id: "pcd_op123456", active: false })).rejects.toThrow(
      "admin",
    );
    await expect(call(api.adminDeletePromo, { id: "pcd_op123456" })).rejects.toThrow("admin");
    expect(a.sql).toHaveLength(0);
  });
});

describe("проверка строк", () => {
  const bad = async (line: Record<string, unknown>, key: string) => {
    await expect(withLine(line)).rejects.toThrow(key);
    expect(a.sql).toHaveLength(0);
  };

  it("диапазон одним полем; мусор и обратный порядок — отказ", async () => {
    await bad({ amount: "50-10" }, "promo.err_amount");
    await bad({ amount: "много" }, "promo.err_amount");
  });

  it("ссылка: ресурс — из списка, товар — cst_…, пустая — отказ", async () => {
    await bad({ ref: "darai" }, "promo.err_ref");
    await bad({ kind: "custom", ref: "wheat" }, "promo.err_ref");
    await bad({ kind: "pack", ref: null }, "promo.err_ref");
  });

  it("вещей больше 100 за ввод — нельзя (бокс, товар, босс); шанс в (0; 100]", async () => {
    await bad({ kind: "pack", ref: "mp_1", amount: "1-101" }, "promo.err_amount_max");
    await bad({ kind: "custom", ref: "cst_w", amount: "500" }, "promo.err_amount_max");
    await bad({ kind: "boss", ref: "yeti", amount: "101" }, "promo.err_amount_max");
    await expect(withLine({ chance: 0 })).rejects.toThrow();
  });

  it("код админа — буквы/цифры/дефис; без строк — отказ", async () => {
    await expect(create({ code: "a b" })).rejects.toThrow("promo.err_code");
    await expect(create({ lines: [] })).rejects.toThrow("promo.err_no_lines");
  });
});

describe("токен", () => {
  const token = { kind: "token", ref: "Darai", amount: "100-500", budget: 10000 };

  it("USDT — никому; без объёма — никому", async () => {
    a.owner = true;
    await expect(withLine({ ...token, ref: "USDT" })).rejects.toThrow("promo.err_usdt");
    await expect(withLine({ ...token, budget: null })).rejects.toThrow("promo.err_token_budget");
    expect(a.sql).toHaveLength(0);
  });

  it("не владелец — отказ до базы, даже с объёмом", async () => {
    await expect(withLine(token)).rejects.toThrow("promo.err_token_owner");
    expect(a.sql).toHaveLength(0);
  });

  it("владелец с объёмом — можно; ресурсы — любому админу", async () => {
    a.owner = true;
    await expect(withLine(token)).resolves.toMatchObject({ ok: true });
    a.owner = false;
    await expect(withLine({ ref: "diamonds" })).resolves.toMatchObject({ ok: true });
  });
});

describe("бокс с деньгами", () => {
  it("строка-бокс с DARAI — только владельцу, до записи кода", async () => {
    await expect(withLine({ kind: "pack", ref: "mp_darai", amount: "1" })).rejects.toThrow(
      "владельца",
    );
    expect(a.sql.some((q) => q.includes("INSERT INTO yuplink.promo_code "))).toBe(false);
    a.owner = true;
    await expect(withLine({ kind: "pack", ref: "mp_darai", amount: "1" })).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe("справочники", () => {
  it("каждая ссылка проверяется одним запросом по своему справочнику", async () => {
    await create({
      lines: [
        { ...goodLine, kind: "pack", ref: "mp_1", amount: "1" },
        { ...goodLine, kind: "likes", ref: null, amount: "5" },
        { ...goodLine, kind: "boss", ref: "yeti", amount: "1" },
      ],
    });
    const refs = a.sql[0];
    expect(refs).toContain("(0, 'pack'::text, 'mp_1'::text), (2, 'boss'::text, 'yeti'::text)");
    expect(refs).toContain("yuplink.chip_packs x WHERE x.id = v.ref");
    expect(refs).toContain("yuplink.nft_packs x WHERE x.id = v.ref");
    expect(refs).toContain("yuplink.raid_boss_template x WHERE x.id = v.ref");
    expect(refs).toContain("x.kind = 'artifact'");
    expect(refs).toContain("lower(t.symbol) = lower(v.ref)");
    expect(a.sql[1]).toContain("INSERT INTO yuplink.promo_code ");
  });

  it("нет в справочнике — отказ, код не заводится", async () => {
    a.missing = ["mp_gone"];
    await expect(withLine({ kind: "pack", ref: "mp_gone", amount: "1" })).rejects.toThrow(
      "promo.err_ref_missing",
    );
    expect(a.sql.some((q) => q.includes("INSERT INTO yuplink.promo_code "))).toBe(false);
  });
});
