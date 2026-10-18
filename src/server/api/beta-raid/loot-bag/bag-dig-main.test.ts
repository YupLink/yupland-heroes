// «Закопать» / «Выкопать» мешочек — лопатой в руках (§8.24): в руках топор —
// отказ «возьми в руки лопату», энергия назад, износа нет, мешочек не тронут;
// взял лопату — закопал и выкопал, износ снят с неё. Лопата одна и основного нет —
// она копает сама и становится основной (выбор при однозначности).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, md5, packOf, resetDb } from "./bag.fake";
import { runCmd } from "./bag.fake-cmd";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("./bag-dig-sql", async () => (await import("./bag.fake-mocks")).digSqlMod);
vi.mock("./bag-read-sql", async () => (await import("./bag.fake-mocks")).readSql);
vi.mock("../tool-wear", async () => (await import("./bag.fake-mocks")).toolWear);
vi.mock("../main-tool/main-tool-read", async () => (await import("./bag.fake-tool")).toolMainRead);
vi.mock("./bag-dig-pay", async () => (await import("./bag.fake-mocks")).digPay);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../owner", async () => (await import("./bag.fake-mocks")).session.owner);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { toolWear, energy } = await import("./bag.fake-mocks");
const { mainTools } = await import("./bag.fake-tool");
const dig = await import("./bag-dig");
type Call = (a: { data: unknown }) => Promise<unknown>;
const call = (fn: unknown, data: object) => (fn as Call)({ data });

const SHOVEL = "custom:cst_shovel";
const AXE = "custom:cst_axe";
const BAG = `lb_${md5("seed")}`;
let n = 0;
const op = () => `press-${++n}-x`;
const bury = () => call(dig.buryLootBag, { bagId: BAG, op: op() });
const unbury = () => call(dig.digLootBag, { bagId: BAG, op: op() });
const shovel = () => packOf("h1").get(SHOVEL);
const net = () => energy.spent - energy.refunded;
const marks = { mob: 0, mine: 0, field: 0, loot: 0 };

beforeEach(() => {
  resetDb();
  toolWear.resetWear();
  mainTools.clear();
  Object.assign(energy, { spent: 0, refunded: 0 });
  db.catalog.set("cst_shovel", { name: "Лопата", shovel: true, wear: 25 });
  db.catalog.set("cst_axe", { name: "Топор", wear: 34 });
  db.accounts.set("w1", "acc1");
  db.heroes.set("w1", { heroId: "h1", capacity: 3, potionCapacity: 0 });
  db.pos.set("w1", { q: 5, r: 6 });
  packOf("h1").set(SHOVEL, { count: 1, marks, wear: 0 });
  packOf("h1").set(AXE, { count: 1, marks, wear: 0 });
  const stack = {
    kind: "custom",
    refId: "cst_banana",
    name: "Банан",
    image: null,
    count: 3,
    marks,
  };
  runCmd({
    cmd: "drop",
    at: { key: "seed", mapId: "map1", q: 5, r: 7, account: "acc9" },
    stacks: [{ stackKey: "custom:cst_banana", ...stack }],
  });
});

describe("закопать и выкопать — лопатой в руках", () => {
  it("в руках топор — «возьми в руки лопату»: энергия назад, износа нет, мешочек цел", async () => {
    mainTools.set("h1", AXE);
    await expect(bury()).rejects.toThrow(`tool.not_main|${JSON.stringify({ tool: "Лопата" })}`);
    expect(net()).toBe(0);
    expect(shovel()).toMatchObject({ count: 1, wear: 0 });
    expect(db.bags.get(BAG)?.buried).toBe(false);
  });

  it("взял лопату — закопал и выкопал, износ снят с лопаты, по 2 энергии", async () => {
    mainTools.set("h1", SHOVEL);
    await bury();
    expect(db.bags.get(BAG)?.buried).toBe(true);
    await unbury();
    expect(db.bags.get(BAG)?.buried).toBe(false);
    expect(shovel()).toMatchObject({ count: 1, wear: 50 });
    expect(packOf("h1").get(AXE)).toMatchObject({ count: 1, wear: 0 });
    expect(net()).toBe(4);
  });

  it("основного нет, лопата одна — она и копает", async () => {
    await bury();
    expect(db.bags.get(BAG)?.buried).toBe(true);
    expect(shovel()).toMatchObject({ count: 1, wear: 25 });
  });
});
