// Таблица соответствий kind → группа: каждая строка ТЗ проверяется отдельно,
// чтобы будущая правка одного леджера не переезжала на другой незаметно.
import { describe, expect, it } from "vitest";
import { groupOfKind, refPrefix } from "./kinds";
import { refPlace } from "./ref-place";

describe("groupOfKind: acc_ledger", () => {
  it("награды, шахты, ввод/вывод, поправки — по kind", () => {
    expect(groupOfKind("acc", "acc_reward", "red:abc")).toBe("reward");
    expect(groupOfKind("acc", "mine", "mine:m:1:2:x")).toBe("mine");
    expect(groupOfKind("acc", "acc_deposit", "dep:1")).toBe("deposit");
    expect(groupOfKind("acc", "acc_stars", null)).toBe("deposit");
    expect(groupOfKind("acc", "acc_withdraw", "wd:1")).toBe("withdraw");
    expect(groupOfKind("acc", "acc_adjust", null)).toBe("gift");
  });

  it("acc_spend — направление в префиксе ref", () => {
    for (const p of [
      "mkt:i:a:n",
      "shop:o:a:1:op",
      "cpack:k",
      "epack:k",
      "esub:acc:t:USDT:op",
      "town-buy:m:1,2:g:op",
    ]) {
      expect(groupOfKind("acc", "acc_spend", p)).toBe("trade_buy");
    }
    expect(groupOfKind("acc", "acc_spend", "mkt-sell:i:a:n")).toBe("trade_sell");
    expect(groupOfKind("acc", "acc_spend", "town-sell:m:1,2:g:op")).toBe("trade_sell");
    for (const p of [
      "portal:m:1,2:n",
      "gate:m:1,2:n",
      "build:m:1:2:1:w",
      "spell_learn:op",
      "boost:op",
      "tree:o:m:1:2",
      "chambers:a:m:1:2:1",
      "field_recall:m:1:2:op:0:token",
      "spell_forget:op:0:token",
      "oblivion:m:1:2:acc:op:0:token",
      "tour:tour_x:acc_1:n0nce:0:token",
    ]) {
      expect(groupOfKind("acc", "acc_spend", p)).toBe("sink");
    }
    expect(groupOfKind("acc", "acc_spend", "unknown:x")).toBe("other");
    expect(groupOfKind("acc", "acc_spend", null)).toBe("other");
  });

  it("возврат идёт в группу исходной траты — сальдо по группе честное", () => {
    expect(groupOfKind("acc", "acc_refund", "mkt:i:a:n:undo")).toBe("trade_buy");
  });
});

describe("groupOfKind: res_ledger и билеты", () => {
  it("ресурсы", () => {
    expect(groupOfKind("res", "market_buy", null)).toBe("trade_buy");
    expect(groupOfKind("res", "market_sell", null)).toBe("trade_sell");
    expect(groupOfKind("res", "wh_take", null)).toBe("other");
    expect(groupOfKind("res", "portal", null)).toBe("sink");
    // Запись на турнир и её откат — сток, сальдо по группе честное.
    expect(groupOfKind("res", "tour_fee", "tour:t:a:n:0:gold")).toBe("sink");
    expect(groupOfKind("res", "tour_fee_refund", "tour:t:a:n:0:gold:back")).toBe("sink");
    expect(groupOfKind("res", "gift", null)).toBe("gift");
    expect(groupOfKind("res", "mine", null)).toBe("mine");
  });

  it("ресурсы по происхождению (§8.18): мобы и награды — награды, грядка — к шахтам", () => {
    expect(groupOfKind("res", "mob", "raidtour:m:c1:rr_1")).toBe("reward");
    expect(groupOfKind("res", "reward", "raidtour:m:c1:rr_2")).toBe("reward");
    expect(groupOfKind("res", "field", "field-leave:m:1:2:acc:x")).toBe("mine");
  });

  it("билеты", () => {
    expect(groupOfKind("ticket", "purchase", null)).toBe("deposit");
    expect(groupOfKind("ticket", "market_sale", null)).toBe("trade_sell");
    expect(groupOfKind("ticket", "market_buy", null)).toBe("trade_buy");
    for (const k of ["raid_reward", "nft_claim", "mining"])
      expect(groupOfKind("ticket", k, null)).toBe("reward");
    for (const k of [
      "chip_pack",
      "energy_pack",
      "like_purchase",
      "craft",
      "building",
      "mint_fee",
      "university_slot",
      "mining_slot",
    ]) {
      expect(groupOfKind("ticket", k, null)).toBe("sink");
    }
    expect(groupOfKind("ticket", "admin_grant", null)).toBe("gift");
    expect(groupOfKind("ticket", "migration", null)).toBe("other");
  });
});

describe("groupOfKind: энергия, лайки, сделки", () => {
  it("энергия: реген/таяние/трата остаются своими группами", () => {
    expect(groupOfKind("energy", "energy_regen", null)).toBe("energy_regen");
    expect(groupOfKind("energy", "energy_decay", null)).toBe("energy_decay");
    expect(groupOfKind("energy", "energy_spend", null)).toBe("energy_spend");
    expect(groupOfKind("energy", "spend:step", null)).toBe("energy_spend");
    for (const k of ["energy_admin", "energy_gift", "energy_owner", "admin_grant"]) {
      expect(groupOfKind("energy", k, null)).toBe("gift");
    }
    expect(groupOfKind("energy", "energy_pack", null)).toBe("deposit");
    expect(groupOfKind("energy", "energy_admin", "esub:gft_1")).toBe("deposit");
    expect(groupOfKind("energy", "energy_reward", null)).toBe("reward");
  });

  it("токены в currency_ledger", () => {
    expect(groupOfKind("energy", "deposit", null)).toBe("deposit");
    expect(groupOfKind("energy", "payout", null)).toBe("withdraw");
    expect(groupOfKind("energy", "reward", null)).toBe("reward");
  });

  it("лайки: синтетический kind", () => {
    expect(groupOfKind("likes", "grant:raid", "raid:x")).toBe("reward");
    expect(groupOfKind("likes", "grant:stars", "stars:x")).toBe("deposit");
    expect(groupOfKind("likes", "grant:gift", "gift:x")).toBe("gift");
    expect(groupOfKind("likes", "spend:hero_levelup", null)).toBe("sink");
  });

  it("сделки: по стороне", () => {
    expect(groupOfKind("trade", "market:buy", null)).toBe("trade_buy");
    expect(groupOfKind("trade", "town:sell", null)).toBe("trade_sell");
    expect(groupOfKind("trade", "gate:pay", null)).toBe("sink");
    expect(groupOfKind("trade", "wh_take:take", null)).toBe("other");
    // Выпитое — сток, как плата; улов — как прочие «забрал/положил».
    expect(groupOfKind("trade", "drink:use", null)).toBe("sink");
    expect(groupOfKind("trade", "fish:take", null)).toBe("other");
  });
});

describe("refPrefix / refPlace", () => {
  it("префикс — до первого двоеточия", () => {
    expect(refPrefix("town-sell:m:1,2:g:op")).toBe("town-sell");
    expect(refPrefix(null)).toBe("");
  });

  it("место из ref по каждому формату", () => {
    expect(refPlace("portal:rmap_a:3,-4:n0nce")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("gate:rmap_a:3,-4:n0nce")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("wh-take:rmap_a:3,-4:custom:x:n")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("town-buy:rmap_a:3,-4:good:op")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("build:rmap_a:3:-4:2:wallet")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("mine:rmap_a:3:-4:x")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("field_recall:rmap_a:3:-4:op")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("oblivion:rmap_a:3:-4:acc:op")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("tree:owner:rmap_a:3:-4")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
    expect(refPlace("chambers:acc:rmap_a:3:-4:1")).toEqual({ mapId: "rmap_a", q: 3, r: -4 });
  });

  it("без места — null, кривые координаты — null", () => {
    expect(refPlace("mkt:i:a:n")).toBeNull();
    expect(refPlace("portal:rmap_a:x,y:n")).toBeNull();
    expect(refPlace(null)).toBeNull();
  });
});
