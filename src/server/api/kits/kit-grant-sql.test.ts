// Запрос выдачи набора: отметка «выдано» только при живой оплате, подарок
// «бокс ×N» из снимка брони (не сгорает), деньги — по корзинам подписки
// (splitPayment) и только вслед за отметкой.
import { describe, expect, it } from "vitest";
import { grantSql, kitGiftRef, type GrantInput } from "./kit-grant-sql";

const base: GrantInput = {
  id: "ko_1",
  payRef: "kit:acc_A:kit_1:op_1",
  token: "USDT",
  amount: 10,
};

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("отметка и подарок", () => {
  const sql = flat(grantSql(base));

  it("отметка «выдано» — только из брони и только при живой оплате", () => {
    expect(sql).toContain("WHERE id = 'ko_1' AND status = 'reserved'");
    expect(sql).toContain("kind = 'acc_spend' AND ref = 'kit:acc_A:kit_1:op_1'");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger WHERE kind = 'acc_refund' AND ref = 'kit:acc_A:kit_1:op_1-undo')",
    );
    expect(sql).toContain("RETURNING id, account_id, box_id, box_count");
  });

  it("подарок — бокс из снимка брони ×N, имя и обложка бокса, бессрочный, с ключом", () => {
    expect(kitGiftRef("ko_1")).toBe("kit:ko_1:box");
    expect(sql).toContain("o.account_id, 'pack', o.box_count, o.box_id, p.name, p.cover_image_url");
    expect(sql).toContain("FROM o LEFT JOIN yuplink.chip_packs p ON p.id = o.box_id");
    expect(sql).toContain("'pending', 'kit:ko_1:box', 'kit', NULL");
    expect(sql).toContain("ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING");
    // Заметка «kit:Имя|» — окно подарков покажет «Набор «Имя»», разделитель вычищен.
    expect(sql).toContain("'kit:' || replace(coalesce(p.name, ''), '|', '/') || '|'");
  });

  it("брони без суммы — не выдаём", () => {
    expect(() => grantSql({ ...base, amount: 0 })).toThrow();
  });
});

describe("деньги — как у подписки", () => {
  it("USDT: 30 % — корзина «$ → карта», 70 % — корзина $, пул не трогаем", () => {
    const sql = flat(grantSql(base));
    expect(sql).toContain(
      "('mbm_ko_1_sub_usd_map', 'sub_usd_map', 'USDT', 3.00000000, 'kit:ko_1:sub_usd_map')",
    );
    expect(sql).toContain(
      "('mbm_ko_1_sub_usd', 'sub_usd', 'USDT', 7.00000000, 'kit:ko_1:sub_usd')",
    );
    expect(sql).toMatch(/FROM o, \(VALUES/);
    expect(sql).not.toContain("darai_pool_move");
  });

  it("DARAI: 60 % сразу в пул карты, 15 % — «Сжечь», 25 % — «Разработчикам»", () => {
    const sql = flat(grantSql({ ...base, token: "Darai", amount: 1000 }));
    expect(sql).toContain("'sub_burn', 'Darai', 150.00000000, 'kit:ko_1:sub_burn'");
    expect(sql).toContain("'sub_dev', 'Darai', 250.00000000, 'kit:ko_1:sub_dev'");
    expect(sql).toContain(
      "SELECT 'dp_ko_1', 'map', 'player_spend', 600.00000000, 'kit:ko_1:map', 'набор', 'kit_ko_1' FROM o",
    );
  });

  it("Stars: целиком в пул звёзд подписок", () => {
    const sql = flat(grantSql({ ...base, token: "STARS", amount: 847 }));
    expect(sql).toContain(
      "('mbm_ko_1_sub_stars', 'sub_stars', 'STARS', 847.00000000, 'kit:ko_1:sub_stars')",
    );
    expect(sql).not.toContain("darai_pool_move");
  });

  it("повтор ничего не удваивает: корзины и пул — ON CONFLICT по ключу", () => {
    const sql = flat(grantSql({ ...base, token: "Darai", amount: 1000 }));
    expect(sql.match(/ON CONFLICT \(ref\) DO NOTHING/g)).toHaveLength(2);
  });
});
