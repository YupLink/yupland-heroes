// Правила авторассылок: значения по умолчанию, прежний плоский формат, мусор,
// сбой чтения — ошибка (а не молча «авто» по умолчанию).
import { describe, expect, it, vi } from "vitest";

const st = { fail: false, value: null as string | null };
vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async () => {
    if (st.fail) throw new Error("MCP timeout");
    return st.value == null ? [] : [{ value: st.value }];
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));

const { DEFAULT_DIST, loadDist, parseDist } = await import("./rules");

describe("правила авторассылок", () => {
  it("по умолчанию: $100 и 1 млрд DARAI — авто, «Раздача DARAI» — вручную", () => {
    expect(parseDist({}).rules).toEqual({
      sub_usd: { mode: "auto", threshold: 100 },
      sub_darai: { mode: "auto", threshold: 1_000_000_000 },
      darai_free: { mode: "manual", threshold: 100_000_000 },
      auc_darai: { mode: "auto", threshold: 1_000_000_000 },
      auc_usd: { mode: "auto", threshold: 100 },
    });
  });

  it("понимает прежний плоский формат", () => {
    const d = parseDist({ usdThreshold: 250, usdMode: "manual", daraiThreshold: 5e8, daraiMode: "auto" });
    expect(d.rules.sub_usd).toEqual({ mode: "manual", threshold: 250 });
    expect(d.rules.sub_darai).toEqual({ mode: "auto", threshold: 5e8 });
  });

  it("мусор в поле — значение по умолчанию, кривые доли разработчиков — кошельки команды из env", () => {
    vi.stubEnv("TEAM_OWNER_WALLET", "owner.tg");
    vi.stubEnv("TEAM_PARTNER_WALLET", "partner.tg");
    const d = parseDist({
      rules: { darai_free: { mode: "auto", threshold: -5 }, sub_usd: { mode: "boom", threshold: 50 } },
      devWallets: [{ wallet: "x.tg", share: 0.7 }],
    });
    expect(d.rules.darai_free).toEqual({ mode: "auto", threshold: 100_000_000 });
    expect(d.rules.sub_usd).toEqual({ mode: "auto", threshold: 50 });
    expect(d.devWallets).toEqual(DEFAULT_DIST.devWallets);
    expect(d.devWallets).toEqual([
      { wallet: "owner.tg", share: 0.5 },
      { wallet: "partner.tg", share: 0.5 },
    ]);
    vi.unstubAllEnvs();
  });

  it("сбой чтения базы — ошибка, а не значения по умолчанию", async () => {
    st.fail = true;
    await expect(loadDist()).rejects.toThrow();
    st.fail = false;
    st.value = JSON.stringify({ rules: { darai_free: { mode: "auto", threshold: 7 } } });
    expect((await loadDist()).rules.darai_free).toEqual({ mode: "auto", threshold: 7 });
  });
});
