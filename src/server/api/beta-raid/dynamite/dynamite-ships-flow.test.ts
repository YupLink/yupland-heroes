// Синий по кораблям целиком (§8.75а, владелец 26.10.2026) на модели базы:
//  · сбитые корабли — в итоге и тосте; «ships» всем на карте;
//  · экипаж — в свой основной город путём заклинания «домой» (teleportHome), события
//    ничьи (by: null), отнесённому — личное «sentHome»; отметка в ключе, ключ снят;
//  · красный (кораблей в итоге нет) — никого не носит и «ships» не шлёт;
//  · повтор нажатия второй раз не носит; ответ потерялся — экипаж всё равно отнесён;
//  · перенос не вышел — ключ ждёт, минутный обход доносит; ушедшего с обломков не носит.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = async () => await import("./dynamite.fake");
vi.mock("@tanstack/react-start", async () => (await fake()).startFn);
vi.mock("@/server/db/mcpClient", async () => (await fake()).mcp);
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", async () => (await fake()).actor);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await fake()).where);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await fake()).backpack);
vi.mock("@/server/api/beta-raid/decor-interact-load", async () => (await fake()).decorLoad);
vi.mock("@/server/raidLive", async () => (await fake()).live);
vi.mock("@/server/api/beta-raid/econ/energy-note", async () => (await fake()).energyNote);
vi.mock("@/server/api/beta-raid/map-change-hooks", async () => (await fake()).hooks);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver-parts", async () => (await fake()).bagParts);
vi.mock("@/server/api/beta-raid/map-journal", async () => (await fake()).journal);
vi.mock("@/server/api/beta-raid/encounter-target", async () => (await fake()).target);
vi.mock("@/server/api/beta-raid/encounter-payout", async () => (await fake()).payout);
vi.mock("@/server/api/beta-raid/encounter-rewards", async () => (await fake()).rewards);
vi.mock("@/server/api/beta-raid/runner-reveal", async () => (await fake()).reveal);
vi.mock("@/server/api/beta-raid/spell-teleport-home", async () => (await fake()).home);

const { s, resetFake } = await import("./dynamite.fake");
const throwIt = (await import("./dynamite-throw"))
  .throwDynamite as unknown as import("./dynamite.fake").ThrowFn;
const { resendCrewsHome } = await import("./dynamite-crew-home");

const BLUE = "custom:cst_hionm0xz40lz";
const data = { stackKey: BLUE, q: 1, r: 0, op: "op_ship01" };
const OP = "dyn:acc_me:op_ship01";
const WRECK = { q: 1, r: 0 };

const shipsBlast = () => ({
  at: WRECK,
  paid: 100,
  kind: "blue",
  mines: [],
  hits: [],
  guards: [],
  decor: [],
  blue: [],
  ships: [
    { id: "ship_a", kind: "big", crew: "acc_cap" },
    { id: "ship_b", kind: "small", crew: null },
  ],
});

const events = (type: string) =>
  s.log.filter((x) => (x as { event?: string }).event === type) as Array<Record<string, unknown>>;

beforeEach(() => {
  resetFake();
  s.result = shipsBlast();
  s.stranded.add("acc_cap");
});

describe("синий по клетке с кораблями", () => {
  it("итог — кораблей 2; экипаж отнесён домой ничьими событиями; ключ снят", async () => {
    const res = await throwIt({ data });
    expect(res).toMatchObject({ ok: true, ships: 2 });
    expect(s.blastCalls[0]).toContain("'blue') AS res;");
    expect(s.homes).toEqual([{ key: "acc_cap", opts: { by: null } }]);
    expect(events("moved")).toEqual([
      { event: "moved", type: "moved", mapId: "rmap_1", from: WRECK, to: null, by: null },
    ]);
    expect(events("sentHome")).toEqual([
      { event: "sentHome", type: "sentHome", mapId: null, to: "acc_cap", by: null },
    ]);
    expect(events("ships")).toEqual([{ event: "ships", type: "ships", mapId: "rmap_1" }]);
    const op = s.ops.get(OP);
    expect(op?.detail.homed).toEqual(["acc_cap"]);
    expect(op?.crewDue).toBe(false);
    expect(s.log.at(-1)).toEqual({ sent: OP });
  });

  it("экипаж — раньше рассылки: «ships» уходит, когда игрока на обломках уже нет", async () => {
    await throwIt({ data });
    const at = (t: string) => s.log.findIndex((x) => (x as { event?: string }).event === t);
    expect(at("sentHome")).toBeLessThan(at("ships"));
  });

  it("красный — кораблей в итоге нет: никого не носит, «ships» нет", async () => {
    s.result = { ...shipsBlast(), kind: "red", ships: [] };
    const res = await throwIt({ data: { ...data, stackKey: "custom:cst_cpsl1cy0hpd7" } });
    expect(res.ships).toBe(0);
    expect(s.homes).toEqual([]);
    expect(events("ships")).toEqual([]);
    expect(s.ops.get(OP)?.crewDue).toBe(false);
  });

  it("корабли без экипажа — разрушены, носить некого", async () => {
    s.result = { ...shipsBlast(), ships: [{ id: "ship_b", kind: "small", crew: null }] };
    const res = await throwIt({ data });
    expect(res.ships).toBe(1);
    expect(s.homes).toEqual([]);
    expect(events("ships")).toHaveLength(1);
  });
});

describe("надёжность переноса", () => {
  it("повтор нажатия — второй раз не носит и не взрывает", async () => {
    await throwIt({ data });
    s.stranded.add("acc_cap"); // даже если бы снова оказался там — отметка ключа решает
    const again = await throwIt({ data });
    expect(again.ships).toBe(2);
    expect(s.blastCalls).toHaveLength(1);
    expect(s.homes).toHaveLength(1);
  });

  it("ответ потерялся после коммита — судит ключ, экипаж отнесён один раз", async () => {
    s.commitThenLose = true;
    await throwIt({ data });
    expect(s.blastCalls).toHaveLength(1);
    expect(s.homes).toHaveLength(1);
    expect(s.ops.get(OP)?.crewDue).toBe(false);
  });

  it("перенос не вышел — ключ ждёт; обход доносит; второй проход ничего не делает", async () => {
    s.homeFail = true;
    await throwIt({ data });
    expect(s.ops.get(OP)?.crewDue).toBe(true);
    expect(s.ops.get(OP)?.detail.homed).toBeUndefined();
    s.homeFail = false;
    expect(await resendCrewsHome()).toBe(1);
    expect(s.homes).toHaveLength(2);
    expect(s.ops.get(OP)?.crewDue).toBe(false);
    expect(await resendCrewsHome()).toBe(0);
    expect(s.homes).toHaveLength(2);
  });

  it("повтор после сбоя — доносит; ушедшего с обломков (отметка не легла) не носит", async () => {
    s.homeFail = true;
    await throwIt({ data });
    s.homeFail = false;
    await throwIt({ data });
    expect(s.homes).toHaveLength(2);
    expect(s.ops.get(OP)?.crewDue).toBe(false);
    // Отметка пропала, а игрок уже не на обломках — обход только снимает ключ.
    const row = s.ops.get(OP)!;
    row.detail.homed = [];
    row.crewDue = true;
    expect(await resendCrewsHome()).toBe(1);
    expect(s.homes).toHaveLength(2);
    expect(row.crewDue).toBe(false);
  });
});
