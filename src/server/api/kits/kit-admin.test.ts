// Админка наборов: сервер проверяет поля тем же kitError, что и форма; бокс —
// только из конструктора боксов; новый набор — в конец списка; купленный набор
// не удаляется; в списке — цены в валютах по курсу. База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const st = { deleted: true, exists: true, box: true, money: false };

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({ requireAdmin: () => "admin.near" }));
vi.mock("../mystic-money", () => ({
  assertPackMoneyRight: async () => {
    if (st.money) throw new Error("только для владельца");
  },
}));
vi.mock("../energy-sub/rate", () => ({ daraiPerUsd: async () => ({ rate: 2_000_000, ageMs: 0 }) }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    sqls.push(flat);
    if (flat.startsWith("DELETE")) return st.deleted ? [{ id: "kit_1" }] : [];
    if (flat.startsWith("SELECT 1 AS x FROM yuplink.chip_packs")) return st.box ? [{ x: 1 }] : [];
    if (flat.startsWith("SELECT 1 AS x")) return st.exists ? [{ x: 1 }] : [];
    if (flat.startsWith("UPDATE yuplink.kit SET box_id")) return [{ id: "kit_1" }];
    if (flat.startsWith("SELECT k.id")) {
      return [
        {
          id: "kit_1",
          box_id: "cp_dragon",
          box_count: 3,
          price_usd: "10.00",
          stock: null,
          per_account: 1,
          sold: "2",
          active: true,
          box_name: "Dragon Pack",
          box_image: null,
        },
      ];
    }
    return [];
  },
}));

const { adminKitList, adminKitSave, adminKitDelete } = await import("./kit-admin");

const fields = {
  boxId: "cp_dragon",
  boxCount: 3,
  priceUsd: 4.99,
  stock: null,
  perAccount: 1,
  active: false,
};

beforeEach(() => {
  sqls.length = 0;
  Object.assign(st, { deleted: true, exists: true, box: true, money: false });
});

describe("список наборов", () => {
  it("бокс — из конструктора, цены — как у подписки по курсу", async () => {
    const [k] = await adminKitList();
    expect(sqls[0]).toContain("LEFT JOIN yuplink.chip_packs p ON p.id = k.box_id");
    expect(k).toMatchObject({
      boxId: "cp_dragon",
      boxName: "Dragon Pack",
      boxCount: 3,
      priceUsd: 10,
      sold: 2,
      prices: { USDT: 10, Darai: 18_000_000, STARS: 847 },
    });
  });
});

describe("сохранение набора", () => {
  it("новый — в конец списка: бокс, сколько штук, цена в $", async () => {
    const r = await adminKitSave({ data: fields });
    expect(r.id).toMatch(/^kit_/);
    expect(sqls[0]).toContain("WHERE id = 'cp_dragon' AND kind = 'mystic'");
    const ins = sqls.find((s) => s.startsWith("INSERT INTO yuplink.kit"))!;
    expect(ins).toContain("(id, box_id, box_count, price_usd, stock, per_account, active, sort)");
    expect(ins).toContain("'cp_dragon', 3, 4.99, NULL, 1, false");
    expect(ins).toContain("COALESCE((SELECT max(sort) FROM yuplink.kit), 0) + 1");
  });

  it("правка — по id; негодные поля — отказ тем же ключом, что у формы, без записи", async () => {
    await expect(adminKitSave({ data: { ...fields, id: "kit_1" } })).resolves.toMatchObject({
      id: "kit_1",
    });
    expect(sqls.find((s) => s.startsWith("UPDATE yuplink.kit SET box_id"))).toContain(
      "box_count = 3, price_usd = 4.99",
    );
    sqls.length = 0;
    await expect(adminKitSave({ data: { ...fields, boxId: "" } })).rejects.toThrow("kits.err_box");
    await expect(adminKitSave({ data: { ...fields, boxCount: 0 } })).rejects.toThrow(
      "kits.err_count",
    );
    await expect(adminKitSave({ data: { ...fields, priceUsd: 0.001 } })).rejects.toThrow(
      "kits.err_price",
    );
    expect(sqls).toHaveLength(0);
  });

  it("бокс с DARAI/Stars — только админ выплат, без записи", async () => {
    st.money = true;
    await expect(adminKitSave({ data: fields })).rejects.toThrow("владельца");
    expect(sqls.filter((s) => s.startsWith("INSERT") || s.startsWith("UPDATE"))).toHaveLength(0);
  });

  it("не бокс из конструктора (пак, удалённый) — отказ, без записи", async () => {
    st.box = false;
    await expect(adminKitSave({ data: fields })).rejects.toThrow("kits.err_box");
    expect(sqls.filter((s) => s.startsWith("INSERT") || s.startsWith("UPDATE"))).toHaveLength(0);
  });
});

describe("удаление набора", () => {
  it("не покупали — удаляется; покупали — отказ; уже удалён — успех", async () => {
    await expect(adminKitDelete({ data: { id: "kit_1" } })).resolves.toMatchObject({ ok: true });
    expect(sqls[0]).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.kit_order o WHERE o.kit_id = k.id)",
    );
    st.deleted = false;
    await expect(adminKitDelete({ data: { id: "kit_1" } })).rejects.toThrow("kits.err_sold");
    st.exists = false;
    await expect(adminKitDelete({ data: { id: "kit_1" } })).resolves.toMatchObject({ ok: true });
  });
});
