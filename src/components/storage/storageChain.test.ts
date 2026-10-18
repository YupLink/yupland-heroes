import { describe, expect, it } from "vitest";
import { CUSHION, HOT_CUSHION, claimableYocto, sortStores, type StoreInfo } from "./storageChain";

const NEAR = 10n ** 24n;
const PRICE = 10n ** 19n;

describe("claimableYocto", () => {
  it("отдаёт излишек минус подушку", () => {
    // 100 000 байт = 1 NEAR хранилища; на балансе 3 NEAR → 2 − подушка
    expect(claimableYocto(3n * NEAR, 100_000n, PRICE, CUSHION)).toBe(2n * NEAR - CUSHION);
  });

  it("излишек не больше подушки — ноль", () => {
    expect(claimableYocto(NEAR + CUSHION, 100_000n, PRICE, CUSHION)).toBe(0n);
    expect(claimableYocto(NEAR + CUSHION / 2n, 100_000n, PRICE, CUSHION)).toBe(0n);
  });

  it("баланс меньше хранилища — ноль, не минус", () => {
    expect(claimableYocto(NEAR / 2n, 100_000n, PRICE, CUSHION)).toBe(0n);
  });

  it("живая лавка 18.10: 0,093 NEAR сверху — забрать нечего", () => {
    expect(claimableYocto(498807293096159823200000064n, 49871416n, PRICE, CUSHION)).toBe(0n);
  });

  it("HOT-коллекция yupai 18.10: ~57 NEAR сверху при подушке 1 NEAR", () => {
    // баланс 127,9186 NEAR, 7 003 420 байт → 70,0342 на хранилище
    const got = claimableYocto(127918605546461796100023566n, 7_003_420n, PRICE, HOT_CUSHION);
    expect(got / NEAR).toBe(56n); // 127,92 − 70,03 − 1 ≈ 56,88
  });
});

const store = (contract: string, role: StoreInfo["role"], claimable: bigint): StoreInfo => ({
  contract,
  family: "mintbase",
  owner: role === "owner" ? "me.near" : "other.near",
  role,
  balance: "0",
  storage: "0",
  claimable: claimable.toString(),
});

describe("sortStores", () => {
  it("свои копилки первыми, внутри — где больше забрать", () => {
    const out = sortStores([
      store("m.near", "minter", 9n * NEAR),
      store("a.near", "owner", 1n),
      store("b.near", "owner", 5n * NEAR),
      store("c.near", "owner", 1n),
    ]);
    expect(out.map((s) => s.contract)).toEqual(["b.near", "a.near", "c.near", "m.near"]);
  });
});
