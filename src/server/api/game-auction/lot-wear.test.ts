// Аукцион: износ артефакта переходит вместе с ним — продавец выставляет группу
// «шаблон + прочность», в залог уходят ровно такие, победитель получает
// подарком с тем же износом, а выдача кладёт его в предмет.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { artLotRef, parseArtLotRef } from "@/lib/auctionArtRef";

const sqls: string[] = [];
const gifts: Array<Record<string, unknown>> = [];
const inserted: Array<Record<string, unknown>> = [];
const takes: unknown[] = [];

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    if (sql.includes("FROM yuplink.auction WHERE id=")) {
      return [
        {
          id: "gaucp_1",
          title: null,
          prize_kind: "artifact",
          prize_ref: "tpl_a",
          prize_qty: 1,
          currency: "res:gold",
          status: "settled",
          source: "player",
          esc_wear: "37.5",
        },
      ];
    }
    if (sql.includes("active AND NOT delivered")) return [{ id: "bid_1", account_id: "acc_win" }];
    return [];
  },
}));
vi.mock("../../db/pg", () => ({ sb: { rpc: async () => ({ error: null }) }, pg: {} }));
vi.mock("../gifts-create", () => ({
  createGift: async (g: Record<string, unknown>) => void gifts.push(g),
}));
vi.mock("./settle-player", () => ({
  PLAYER_DUE_SQL: "false",
  settlePlayerLot: async () => {},
  voidStaleEscrow: async () => {},
}));
vi.mock("./settle-game", () => ({ GAME_DUE_SQL: "false", bookGameIncome: async () => {} }));
vi.mock("./schema", () => ({ ensureAuctionSchema: async () => {} }));
vi.mock("../beta-raid/art-stock", () => ({
  takeArtifacts: async (o: { pick: unknown }) => (
    takes.push(o.pick),
    [{ id: "it_1", templateId: "tpl_a" }]
  ),
  restoreArtifacts: async () => {},
}));

beforeEach(() => {
  sqls.length = 0;
  gifts.length = 0;
  inserted.length = 0;
  takes.length = 0;
});

describe("ссылка группы пикера", () => {
  it("целый — голый шаблон (как до износа), изношенный — шаблон~износ", () => {
    expect(artLotRef("tpl_a", 0)).toBe("tpl_a");
    expect(artLotRef("tpl_a", 37.5)).toBe("tpl_a~37.5");
    expect(parseArtLotRef("tpl_a~37.5")).toEqual({
      templateId: "tpl_a",
      wear: 37.5,
      enchantPct: null,
    });
    expect(parseArtLotRef("tpl_a")).toEqual({ templateId: "tpl_a", wear: 0, enchantPct: null });
    expect(parseArtLotRef("tpl_a~999")).toEqual({
      templateId: "tpl_a",
      wear: 100,
      enchantPct: null,
    });
  });

  it("зачарованная группа — «!e<процент>», обычная — без него (31.10.2026)", () => {
    expect(artLotRef("tpl_a", 0, 12)).toBe("tpl_a!e12");
    expect(artLotRef("tpl_a", 37.5, -8)).toBe("tpl_a~37.5!e-8");
    expect(artLotRef("tpl_a", 37.5)).toBe("tpl_a~37.5");
    expect(parseArtLotRef("tpl_a~37.5!e-8")).toEqual({
      templateId: "tpl_a",
      wear: 37.5,
      enchantPct: -8,
    });
    expect(parseArtLotRef("tpl_a!e12")).toEqual({ templateId: "tpl_a", wear: 0, enchantPct: 12 });
  });
});

describe("залог и выигрыш", () => {
  it("в залог уходят ровно такие, какие выбраны (шаблон + износ)", async () => {
    const { takeEscrow } = await import("./escrow");
    await takeEscrow({
      id: "gaucp_1",
      title: null,
      prize_kind: "artifact",
      prize_ref: "tpl_a",
      prize_qty: 1,
      seller_account_id: "acc_s",
      seller_wallet: "w_s",
      escrow: { wear: 37.5 },
    });
    // Лот, выставленный до износа (wear в залоге нет), — любые свободные.
    await takeEscrow({
      id: "gaucp_old",
      title: null,
      prize_kind: "artifact",
      prize_ref: "tpl_a",
      prize_qty: 1,
      seller_account_id: "acc_s",
      seller_wallet: "w_s",
      escrow: {},
    });
    expect(takes).toEqual([
      { templateId: "tpl_a", wear: 37.5 },
      { templateId: "tpl_a", wear: null },
    ]);
  });

  it("победитель получает подарок с износом продавца", async () => {
    const { settleOne } = await import("./settle");
    await settleOne("gaucp_1");
    expect(sqls.some((s) => s.includes("escrow->>'wear' AS esc_wear"))).toBe(true);
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({
      accountId: "acc_win",
      kind: "art",
      refId: "tpl_a",
      itemWear: 37.5,
    });
  });
});

describe("подарок с износом", () => {
  it("колонка износа пишется только у подарков, где он есть", async () => {
    vi.resetModules();
    const seen: string[] = [];
    vi.doMock("../../db/mcpClient", () => ({
      mcpExec: async (sql: string) => (seen.push(sql), [{ account_id: "acc" }]),
    }));
    vi.doUnmock("../gifts-create");
    const { createGifts } = await import("../gifts-create");
    await createGifts([{ accountId: "acc", kind: "pack", amount: 1 }], { notify: false });
    await createGifts([{ accountId: "acc", kind: "art", amount: 1, itemWear: 37.5 }], {
      notify: false,
    });
    expect(seen[0]).not.toContain("item_wear");
    expect(seen[1]).toContain("expires_at, item_wear)");
    expect(seen[1]).toMatch(/, 37\.5\)/);
  });

  it("выдача кладёт износ в сам предмет", async () => {
    vi.resetModules();
    vi.doMock("../../db/pg", () => ({
      sb: {},
      pg: {
        mysticItemTemplates: { findOne: async () => ({ id: "tpl_a", kind: "artifact" }) },
        userGameItems: {
          insert: async (rows: Array<Record<string, unknown>>) => void inserted.push(...rows),
        },
      },
    }));
    vi.doMock("../user-shared", () => ({ accountOf: async () => "acc_win" }));
    vi.doMock("../gifts-once", () => ({
      claimDeliverOnce: async () => true,
      releaseDeliverOnce: async () => {},
    }));
    vi.doMock("../gifts-art-wear", () => ({
      giftWearForDelivery: async () => 37.5,
      giftEnchantsForDelivery: async () => [],
      applyGiftEnchants: async () => {},
    }));
    const { deliverGift } = await import("../gifts-deliver");
    await deliverGift("w_win", {
      id: "gft_1",
      account_id: "acc_win",
      kind: "art",
      amount: 1,
      ref_id: "tpl_a",
      title: null,
      image: null,
      note: null,
      status: "claimed",
      created_at: "",
      expires_ms: null,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ template_id: "tpl_a", kind: "artifact", wear: 37.5 });
  });
});
