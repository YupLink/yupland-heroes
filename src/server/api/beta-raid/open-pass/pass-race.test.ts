// Вход за энергию (§8.23, поправки 30.09): повторы, гонки и отказы. Одно
// нажатие не платит дважды — ни на повторе моста (сколько бы попыток ни было,
// даже если окно тем временем закрыло вход или герой шагнул), ни на втором
// тапе по ещё не перечитанному окну; повтор ничего не пишет — вход не
// продлевается и не оживает. Цена выше показанной кнопкой — отказ «Цена
// изменилась», ничего не списано. Энергии мало или далеко — без денег.
// Ручка настоящая; база — фейк сундука (pchest.fake) и входа (pass.fake).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { energyOf, f } from "@/server/api/beta-raid/plain-chest/pchest.fake";
import { MIN, fill, passKit, resetPass } from "./pass.fake-mocks";

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

describe("повтор моста — одна плата, без записи", () => {
  it("мост применил открытие, ответ потерян, повтор — одна плата", async () => {
    fill([20, 20]);
    f.replay = 1;
    await expect(open()).resolves.toMatchObject({ ok: true });
    expect(energyOf("w1")).toBe(98);
    expect(await alive("pc:pc_1")).toBe(true);
  });

  it("третья попытка моста через 70 с — всё ещё без второй платы", async () => {
    fill([20]);
    await open({}, "press-slow");
    f.clock += 70_000;
    await expect(open({}, "press-slow")).resolves.toMatchObject({ paid: 0 });
    expect(energyOf("w1")).toBe(99);
  });

  it("окно закрыли, пока шёл повтор моста, — второй платы нет, вход не оживает", async () => {
    fill([20, 20]);
    await open({}, "press-closed");
    await close({ ops: ["press-closed"] });
    f.clock += 2 * MIN;
    await expect(open({}, "press-closed")).resolves.toMatchObject({ paid: 0 });
    expect(await alive("pc:pc_1")).toBe(false);
    expect(energyOf("w1")).toBe(98);
  });

  it("шагнул, а мост повторил нажатие, — второй платы нет, вход на новой клетке не появляется", async () => {
    fill([20]);
    await open({}, "press-step");
    f.ver.set("acc1", 1);
    await expect(open({}, "press-step")).resolves.toMatchObject({ paid: 0 });
    expect(await alive("pc:pc_1")).toBe(false);
    expect(energyOf("w1")).toBe(99);
  });

  it("старый ключ нажатия спустя время — ни платы, ни входа; новое нажатие — платное", async () => {
    fill([20, 20]);
    await open({}, "press-old");
    f.clock += 11 * MIN;
    await expect(open({}, "press-old")).resolves.toMatchObject({ paid: 0 });
    expect(await alive("pc:pc_1")).toBe(false);
    await expect(open()).resolves.toMatchObject({ paid: 2 });
    expect(energyOf("w1")).toBe(96);
  });
});

describe("гонки нажатий", () => {
  it("два одинаковых нажатия разом — одна плата", async () => {
    fill([20, 20, 20]);
    await Promise.all([open({}, "press-twin"), open({}, "press-twin")]);
    expect(energyOf("w1")).toBe(97);
  });

  it("второй тап после потерянного ответа (новый ключ) — вход жив, второй платы нет", async () => {
    fill([20]);
    f.lose = "open";
    await expect(open({}, "press-lost")).rejects.toThrow();
    expect(energyOf("w1")).toBe(99);
    await expect(open({}, "press-again")).resolves.toMatchObject({ paid: 0 });
    expect(await alive("pc:pc_1")).toBe(true);
    expect(energyOf("w1")).toBe(99);
  });

  it("два разных нажатия разом (две вкладки) — платит одно, второе видит живой вход", async () => {
    fill([20]);
    await Promise.all([open({}, "press-tab-1"), open({}, "press-tab-2")]);
    expect(energyOf("w1")).toBe(99);
  });
});

describe("цена и отказы — без денег", () => {
  it("сундук наполнили, пока кнопка показывала 1⚡, — «Цена изменилась», ничего не списано", async () => {
    fill([20, 20, 20]);
    await expect(open({ price: 1 })).rejects.toThrow('pass.price_changed|{"n":3}');
    expect(energyOf("w1")).toBe(100);
    expect(await alive("pc:pc_1")).toBe(false);
    // Окно перечитало и показало 3⚡ — открывается по ней.
    await expect(open({ price: 3 })).resolves.toMatchObject({ paid: 3 });
  });

  it("стало дешевле показанного — списывается текущая цена", async () => {
    fill([20]);
    await expect(open({ price: 4 })).resolves.toMatchObject({ paid: 1 });
    expect(energyOf("w1")).toBe(99);
  });

  it("энергии меньше цены — «Нужно N энергии», входа нет, ничего не списано", async () => {
    fill([20, 20, 20]);
    f.energy.set("w1", 2);
    await expect(open()).rejects.toThrow('braid.need_energy|{"n":3}');
    expect(energyOf("w1")).toBe(2);
    expect(await alive("pc:pc_1")).toBe(false);
  });

  it("пустой сундук без энергии — «Нужно 1 энергии»", async () => {
    f.energy.set("w1", 0);
    await expect(open()).rejects.toThrow('braid.need_energy|{"n":1}');
    expect(await alive("pc:pc_1")).toBe(false);
  });

  it("далеко от сундука — «подойди», денег не взяли", async () => {
    fill([20]);
    f.pos.set("w1", { q: 9, r: 9 });
    await expect(open()).rejects.toThrow("chest.approach");
    expect(energyOf("w1")).toBe(100);
  });
});
