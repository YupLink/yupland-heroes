// Вход за энергию (владелец, 29–30.09.2026; ПРАВИЛА §8.23): мешочек — 1⚡,
// сундук — занятые ячейки в миг открытия, но не меньше 1 (пустой — 1), у
// чужого магического — ячейки сети хозяина. Каждое новое открытие платит:
// живой вход ничего не даёт даром и не продлевается (срок — 10 минут от
// нажатия); закрыл окно или сошёл с клетки — закрыт, следующее открытие снова
// платное. Повторы, гонки и отказы — pass-race.test.
// Ручка настоящая; база — фейк сундука (pchest.fake) и входа (pass.fake).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { energyOf, f } from "@/server/api/beta-raid/plain-chest/pchest.fake";
import { BAG, MIN, fill, notes, passKit, resetPass } from "./pass.fake-mocks";

const M = vi.hoisted(() => "@/server/api/beta-raid/plain-chest/pchest.fake-mocks");
const P = vi.hoisted(() => "@/server/api/beta-raid/open-pass/pass.fake-mocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/api/beta-raid/open-pass/pass-sql", async () => (await import(M)).passSql);
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", async () => (await import(M)).rowMod);
vi.mock("@/server/api/beta-raid/econ/energy-note", async () => (await import(P)).energyNote);
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", async () => (await import(P)).bagActor);
vi.mock("@/server/api/beta-raid/chest/chest-row", async () => (await import(P)).chestRow);

const pass = await import("@/server/api/beta-raid/open-pass/pass");
const { open, close, alive } = passKit(pass);

beforeEach(resetPass);

describe("цена: max(1, занятые ячейки), мешочек — 1", () => {
  it("пустой сундук — 1 энергия, вход есть", async () => {
    await expect(open()).resolves.toMatchObject({ paid: 1 });
    expect(await alive("pc:pc_1")).toBe(true);
    expect(energyOf("w1")).toBe(99);
    expect(notes).toEqual([["w1", 1, "chest_open"]]);
  });

  it("три занятые ячейки (20 + 20 + 1) — 3 энергии, причина chest_open", async () => {
    fill([20, 20, 1]);
    await expect(open()).resolves.toMatchObject({ paid: 3 });
    expect(energyOf("w1")).toBe(97);
    expect(notes).toEqual([["w1", 3, "chest_open"]]);
  });

  it("полный сундук (10 ячеек) — 10 энергии", async () => {
    fill(Array(10).fill(20));
    await expect(open()).resolves.toMatchObject({ paid: 10 });
    expect(energyOf("w1")).toBe(90);
  });

  it("мешочек — 1 энергия, причина bag_open", async () => {
    await expect(open({ bagId: BAG })).resolves.toMatchObject({ paid: 1 });
    expect(await alive(`lb:${BAG}`)).toBe(true);
    expect(notes).toEqual([["w1", 1, "bag_open"]]);
  });

  it("чужой магический — по ячейкам сети хозяина; пустая сеть — 1", async () => {
    f.chests.clear();
    f.magic.set("5,6", { owner: "acc2", buried: false });
    f.net.set("acc2", new Map([["custom:ore", 45]]));
    await expect(open()).resolves.toMatchObject({ paid: 3 });
    expect(await alive("mc:map1:5:6")).toBe(true);
    f.net.set("acc2", new Map());
    await close();
    await expect(open()).resolves.toMatchObject({ paid: 1 });
    expect(energyOf("w1")).toBe(96);
  });
});

describe("каждое открытие платит, продления нет", () => {
  it("закрыл окно и открыл снова — снова платно", async () => {
    fill([20]);
    await open({}, "press-one");
    await close({ ops: ["press-one"] });
    expect(await alive("pc:pc_1")).toBe(false);
    await expect(open()).resolves.toMatchObject({ paid: 1 });
    expect(energyOf("w1")).toBe(98);
  });

  it("тап при живом входе (окно ещё не перечитано) — без платы и БЕЗ продления", async () => {
    fill([20, 20]);
    await open();
    f.clock += 9 * MIN;
    await expect(open()).resolves.toMatchObject({ paid: 0 });
    f.clock += MIN + 1;
    // Срок — 10 минут от первого, платного нажатия: второй тап его не продлил.
    expect(await alive("pc:pc_1")).toBe(false);
    await expect(pass.requirePass("acc1", "pc:pc_1")).rejects.toThrow("pass.closed");
    expect(energyOf("w1")).toBe(98);
  });

  it("прошло 10 минут — вход закрыт; новое открытие снова платное", async () => {
    fill([20]);
    await open();
    f.clock += 10 * MIN + 1;
    expect(await alive("pc:pc_1")).toBe(false);
    await expect(open()).resolves.toMatchObject({ paid: 1 });
    expect(energyOf("w1")).toBe(98);
  });

  it("сошёл с клетки — вход закрыт; вернулся — снова платно", async () => {
    fill([20, 20]);
    await open();
    f.ver.set("acc1", 1);
    expect(await alive("pc:pc_1")).toBe(false);
    await expect(open()).resolves.toMatchObject({ paid: 2 });
  });
});

describe("закрыть окно", () => {
  it("вкладка до выката (без ключей) — вход сундука и мешочки клетки закрыты", async () => {
    await open();
    await open({ bagId: BAG });
    await close({ bagIds: [BAG] });
    expect(await alive("pc:pc_1")).toBe(false);
    expect(await alive(`lb:${BAG}`)).toBe(false);
  });

  it("окно мешочков закрывает только мешочки — вход в сундук клетки жив", async () => {
    await open({}, "press-chest");
    await open({ bagId: BAG }, "press-bag");
    await close({ bagIds: [BAG], chest: false, ops: ["press-bag"] });
    expect(await alive(`lb:${BAG}`)).toBe(false);
    expect(await alive("pc:pc_1")).toBe(true);
  });

  it("окно закрывает только свои входы: опоздавшее закрытие старого окна не гасит оплаченный новым", async () => {
    fill([20]);
    await open({}, "press-old-win");
    await close({ ops: ["press-old-win"] });
    await expect(open({}, "press-new-win")).resolves.toMatchObject({ paid: 1 });
    // Закрытие старого окна пришло ещё раз, с опозданием (повтор моста).
    await close({ ops: ["press-old-win"] });
    expect(await alive("pc:pc_1")).toBe(true);
    expect(energyOf("w1")).toBe(98);
  });
});
