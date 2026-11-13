// Право promo_soft (владелец, 04.11.2026): не админ заводит промокоды только на
// энергию и лайки; создатель пишется в код; список, вкл/выкл и удаление — только
// свои коды.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a, call, goodLine, input, resetAdminFake } from "./promo-admin.fake";

const s = vi.hoisted(() => ({ right: true }));
vi.mock("@tanstack/react-start", async () => (await import("./promo-admin.fake")).serverFn);
vi.mock("@/server/auth", async () => ({
  ...(await import("./promo-admin.fake")).auth,
  getCurrentWallet: () => "designer.near",
}));
vi.mock("@/server/admin-rights", () => ({ walletHasRight: async () => s.right }));
vi.mock("@/server/db/mcpClient", async () => (await import("./promo-admin.fake")).mcp);

const api = await import("./promo-admin");
const energy = { ...goodLine, kind: "energy", ref: null, amount: "50" };

beforeEach(() => {
  resetAdminFake();
  a.admin = false;
  s.right = true;
});

describe("промокоды не админа", () => {
  it("энергия и лайки — можно, создатель — её кошелёк", async () => {
    const likes = { ...energy, kind: "likes", amount: "5" };
    expect(await call(api.adminCreatePromo, input({ lines: [energy, likes] }))).toMatchObject({
      ok: true,
    });
    expect(a.sql.find((q) => q.includes("INSERT INTO yuplink.promo_code "))).toContain(
      "'designer.near'",
    );
  });

  it("ресурс, токен, вещи — отказ до базы", async () => {
    await expect(call(api.adminCreatePromo, input())).rejects.toThrow("promo.err_kind_soft");
    await expect(
      call(
        api.adminCreatePromo,
        input({ lines: [energy, { ...goodLine, kind: "pack", ref: "mp_1", amount: "1" }] }),
      ),
    ).rejects.toThrow("promo.err_kind_soft");
    expect(a.sql).toHaveLength(0);
  });

  it("список, вкл/выкл, удаление — только свои коды", async () => {
    await call(api.adminListPromos, { limit: 50 });
    expect(a.sql.at(-1)).toContain("WHERE c.created_by = 'designer.near'");
    await expect(call(api.adminTogglePromo, { id: "pcd_op123456", active: false })).rejects.toThrow(
      "promo.err_not_yours",
    );
    expect(a.sql.at(-1)).toContain("AND created_by = 'designer.near'");
    a.deleted = false;
    await expect(call(api.adminDeletePromo, { id: "pcd_op123456" })).rejects.toThrow(
      "promo.err_not_yours",
    );
  });

  it("без права — отказ как раньше", async () => {
    s.right = false;
    await expect(call(api.adminCreatePromo, input({ lines: [energy] }))).rejects.toThrow("admin");
    expect(a.sql).toHaveLength(0);
  });
});
