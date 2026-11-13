// Разбор блока индексатора: старые строки DARAI и события NEP-141/171, подделки и неуспешные чеки.
import { describe, expect, it } from "vitest";
import { parseOutcomes, type ChainWatch, type OutcomeItem } from "./parse-block";
import { writeSql } from "./chain-sql";

const watch: ChainWatch = {
  accounts: new Set(["darai_gdrop.near"]),
  tokens: new Set(["darai.tkn.near", "usdt.tether-token.near"]),
  nftContracts: new Set(["yuplandshop.mintbase1.near"]),
};

const ok = { SuccessValue: "" };
const outcome = (
  receipt: string,
  executor: string,
  logs: string[],
  status: unknown = ok,
): OutcomeItem => ({
  txHash: `tx_${receipt}`,
  receiptId: receipt,
  executor,
  logs,
  status,
  height: 100,
  atMs: 1793633050085,
});
const blockOf = (...outs: OutcomeItem[]): OutcomeItem[] => outs;
const parseBlock = parseOutcomes;
const ev = (standard: string, event: string, data: unknown[]) =>
  `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event, data })}`;

describe("разбор блока", () => {
  it("DARAI: строка «Transfer … to наш» + «Memo» — платёж с памяткой; время блока", () => {
    const p = parseBlock(
      blockOf(
        outcome("r1", "darai.tkn.near", [
          "The account is already registered, refunding the deposit",
          "Transfer 1000000000000000000000000 from player.tg to darai_gdrop.near",
          "Memo: buy energy pack enp_1",
        ]),
      ),
      watch,
    );
    expect(p.ft).toEqual([
      {
        id: "r1:1",
        height: 100,
        atMs: 1793633050085,
        txHash: "tx_r1",
        receiptId: "r1",
        token: "darai.tkn.near",
        kind: "transfer",
        from: "player.tg",
        to: "darai_gdrop.near",
        amount: "1000000000000000000000000",
        memo: "buy energy pack enp_1",
      },
    ]);
  });

  it("подделка: «Transfer» от чужого контракта, неуспешный чек и чужие кошельки — мимо", () => {
    const fake = "Transfer 5 from a.near to darai_gdrop.near";
    const p = parseBlock(
      blockOf(
        outcome("r1", "evil.near", [fake]),
        outcome("r2", "darai.tkn.near", [fake], { Failure: {} }),
        outcome("r3", "darai.tkn.near", ["Transfer 5 from a.near to b.near"]),
      ),
      watch,
    );
    expect(p.ft).toEqual([]);
  });

  it("NEP-141: событие пишется, старые строки того же чека — нет (без двойного счёта)", () => {
    const p = parseBlock(
      blockOf(
        outcome("r1", "usdt.tether-token.near", [
          ev("nep141", "ft_transfer", [
            {
              old_owner_id: "darai_gdrop.near",
              new_owner_id: "owner.tg",
              amount: "35500000",
              memo: "dev",
            },
          ]),
          "Transfer 35500000 from darai_gdrop.near to owner.tg",
        ]),
      ),
      watch,
    );
    expect(p.ft.map((r) => [r.kind, r.from, r.to, r.amount, r.memo])).toEqual([
      ["transfer", "darai_gdrop.near", "owner.tg", "35500000", "dev"],
    ]);
  });

  it("возврат ft_transfer_call — отдельной строкой «refund»", () => {
    const p = parseBlock(
      blockOf(outcome("r1", "darai.tkn.near", ["Refund 7 from shop.near to darai_gdrop.near"])),
      watch,
    );
    expect(p.ft.map((r) => [r.kind, r.from, r.to, r.amount])).toEqual([
      ["refund", "shop.near", "darai_gdrop.near", "7"],
    ]);
  });

  it("NEP-171 нашего контракта — все события, по строке на token_id; чужой контракт — мимо", () => {
    const p = parseBlock(
      blockOf(
        outcome("r1", "yuplandshop.mintbase1.near", [
          ev("nep171", "nft_transfer", [
            { old_owner_id: "a.tg", new_owner_id: "b.tg", token_ids: ["1", "2"] },
          ]),
          ev("nep171", "nft_mint", [{ owner_id: "c.tg", token_ids: ["3"] }]),
        ]),
        outcome("r2", "other.mintbase1.near", [
          ev("nep171", "nft_burn", [{ owner_id: "a.tg", token_ids: ["9"] }]),
        ]),
      ),
      watch,
    );
    expect(p.nft.map((r) => [r.event, r.tokenId, r.from, r.to])).toEqual([
      ["transfer", "1", "a.tg", "b.tg"],
      ["transfer", "2", "a.tg", "b.tg"],
      ["mint", "3", null, "c.tg"],
    ]);
  });

  it("запись: строки, «разобрано» и курсор одним оператором, кавычки экранированы", () => {
    const p = parseBlock(
      blockOf(
        outcome("r'1", "darai.tkn.near", [
          "Transfer 1 from x.tg to darai_gdrop.near",
          "Memo: it's",
        ]),
      ),
      watch,
    );
    const cur = [{ name: "acct:darai_gdrop.near", height: 100, atMs: 1793633050085 }];
    const sql = writeSql(p, [{ hash: "tx_r'1", account: "darai_gdrop.near", height: 100 }], cur)!;
    expect(sql).toContain("INSERT INTO yuplink.chain_ft");
    expect(sql).toContain("'it''s'");
    expect(sql).toContain("'r''1:0'");
    expect(sql).toContain("INSERT INTO yuplink.chain_tx_seen");
    expect(sql).toContain("INSERT INTO yuplink.chain_cursor");
    expect(writeSql({ ft: [], nft: [] }, [], cur)).not.toContain("chain_ft");
    expect(writeSql({ ft: [], nft: [] }, [], [])).toBeNull();
  });

  it("владелец NFT: последнее событие по блоку; сожжённая — без владельца; старое не затирает", () => {
    const p = parseBlock(
      blockOf(
        outcome("r1", "yuplandshop.mintbase1.near", [
          ev("nep171", "nft_transfer", [
            { old_owner_id: "a.tg", new_owner_id: "b.tg", token_ids: ["7"] },
          ]),
          ev("nep171", "nft_burn", [{ owner_id: "b.tg", token_ids: ["8"] }]),
        ]),
      ),
      watch,
    );
    const sql = writeSql(p, [], [])!;
    expect(sql).toContain("INSERT INTO yuplink.chain_nft_owner");
    expect(sql).toContain("'7', 'b.tg', 100::bigint");
    expect(sql).toContain("'8', NULL, 100::bigint");
    expect(sql).toContain("WHERE EXCLUDED.height >= yuplink.chain_nft_owner.height");
  });
});
