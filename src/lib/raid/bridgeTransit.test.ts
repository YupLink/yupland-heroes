import { describe, expect, it } from "vitest";
import { bridgeAxes, canWalkBridgeEdge, shipTransit, type HexCell, type WaterCell } from "./bridgeTransit";

const bridge = { deckAxis: 1, channelAxis: 0 } as const;
const sea = (bridgeCell = false): WaterCell => ({ water: true, ocean: false, blocked: false, bridge: bridgeCell ? bridge : null });
const key = (c: HexCell) => `${c.q},${c.r}`;

describe("bridge passage", () => {
  it("requires two different valid axes", () => {
    expect(bridgeAxes(bridge)).toEqual(bridge);
    expect(bridgeAxes({ deckAxis: 0, channelAxis: 0 })).toBeNull();
    expect(bridgeAxes({ deckAxis: 3, channelAxis: 1 })).toBeNull();
  });

  it("lets a walker use the deck but not step off into the channel", () => {
    expect(canWalkBridgeEdge({ q: 0, r: -1 }, { q: 0, r: 0 }, null, bridge)).toBe(true);
    expect(canWalkBridgeEdge({ q: 0, r: 0 }, { q: 1, r: 0 }, bridge, null)).toBe(false);
  });

  it("passes a ship across several bridge cells in both directions", () => {
    const cells = new Map([["0,0", sea()], ["1,0", sea(true)], ["2,0", sea(true)], ["3,0", sea()]]);
    const read = (c: HexCell) => cells.get(key(c)) ?? null;
    expect(shipTransit({ q: 0, r: 0 }, { q: 1, r: 0 }, read)?.exit).toEqual({ q: 3, r: 0 });
    expect(shipTransit({ q: 3, r: 0 }, { q: -1, r: 0 }, read)?.exit).toEqual({ q: 0, r: 0 });
  });

  it("rejects occupied exit and a mismatched water channel", () => {
    const cells = new Map([["1,0", sea(true)], ["2,0", { ...sea(), blocked: true }]]);
    expect(shipTransit({ q: 0, r: 0 }, { q: 1, r: 0 }, (c) => cells.get(key(c)) ?? null)).toBeNull();
    cells.set("2,0", sea());
    cells.set("1,0", { ...sea(true), bridge: { deckAxis: 0, channelAxis: 1 } });
    expect(shipTransit({ q: 0, r: 0 }, { q: 1, r: 0 }, (c) => cells.get(key(c)) ?? null)).toBeNull();
  });
});
