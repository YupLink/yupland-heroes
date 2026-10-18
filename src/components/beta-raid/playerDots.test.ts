// Точки чужих игроков живут мимо React: кадр будится только на настоящую
// смену раскладки, а при выключенном показе — не будится вовсе.
import { describe, expect, it, vi } from "vitest";
import { getPlayerDots, playersPusher, subscribePlayerDots } from "./playerDots";

type Data = Parameters<ReturnType<typeof playersPusher>>[0];
const data = (cells: Array<{ q: number; r: number; count: number }>) =>
  ({ cells, defeated: [], defeatedRunners: [], expired: [] }) as unknown as Data;

describe("playerDots", () => {
  it("раскладка → точки; тот же список повторно — подписчиков не будит", () => {
    const push = playersPusher(false);
    const woke = vi.fn();
    const off = subscribePlayerDots(woke);
    const d = data([{ q: 1, r: 2, count: 3 }]);
    push(d);
    expect(getPlayerDots().get("1,2")).toBe(3);
    push(d);
    expect(woke).toHaveBeenCalledTimes(1);
    push(data([{ q: 4, r: 5, count: 1 }]));
    expect(woke).toHaveBeenCalledTimes(2);
    expect([...getPlayerDots().keys()]).toEqual(["4,5"]);
    off();
  });

  it("показ выключен — пусто, и новые шаги кадр не будят", () => {
    playersPusher(false)(data([{ q: 1, r: 1, count: 1 }]));
    const hidden = playersPusher(true);
    const woke = vi.fn();
    const off = subscribePlayerDots(woke);
    hidden(data([{ q: 2, r: 2, count: 1 }]));
    expect(getPlayerDots().size).toBe(0);
    hidden(data([{ q: 3, r: 3, count: 1 }]));
    expect(woke).toHaveBeenCalledTimes(1);
    off();
  });
});
