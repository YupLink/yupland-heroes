// Лагерь онлайн (владелец, 09.11.2026): кто-то из клетки в игре — анимированный лагерь
// и счёт «онлайн/офлайн» через черту; все офлайн — прежний лагерь и кружок.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campOnlineDelay, CAMP_ONLINE_KEY } from "./campOnline";
import { drawPlayerCamp, drawPlayerCount } from "./drawPlayers";

type Call = { op: string; args: unknown[] };
function sceneWith(online: Map<string, number>, scale = 1, sprite = true) {
  const calls: Call[] = [];
  const g = new Proxy(
    {},
    {
      get: (_t, op: string) =>
        op === "measureText"
          ? (t: string) => ({ width: t.length * 6 })
          : (...args: unknown[]) => void calls.push({ op, args }),
      set: (_t, op: string, v) => (calls.push({ op: `=${op}`, args: [v] }), true),
    },
  );
  const img = (w: number) => ({ complete: true, naturalWidth: w, naturalHeight: 209 });
  const images = new Map<string, unknown>([["camp", img(196)]]);
  if (sprite) images.set(CAMP_ONLINE_KEY, img(1280));
  const scene = { g, images, scale, playersOnline: online } as never;
  return { scene, calls, images };
}
const at = { x: 0, y: 0, key: "3,4" };
const drawn = (calls: Call[], images: Map<string, unknown>) =>
  calls.filter((c) => c.op === "drawImage").map((c) => (c.args[0] === images.get("camp") ? "camp" : "online"));
const texts = (calls: Call[]) => calls.filter((c) => c.op === "fillText").map((c) => c.args[0]);

beforeEach(() => {
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  campOnlineDelay();
});
afterEach(() => vi.unstubAllGlobals());

describe("лагерь онлайн", () => {
  it("онлайн и офлайн в клетке — анимация онлайн, счёт «2/1»", () => {
    const { scene, calls, images } = sceneWith(new Map([["3,4", 2]]));
    drawPlayerCamp(scene, at, 3);
    expect(drawn(calls, images)).toEqual(["online"]);
    expect(texts(calls)).toEqual(["2", "/", "1"]);
    const d = campOnlineDelay();
    expect(d).toBeGreaterThanOrEqual(16);
    expect(d).toBeLessThanOrEqual(120);
    expect(campOnlineDelay()).toBeNull();
  });

  it("все онлайн — без черты", () => {
    const { scene, calls } = sceneWith(new Map([["3,4", 2]]));
    drawPlayerCount(scene, at, 2);
    expect(texts(calls)).toEqual(["2"]);
  });

  it("все офлайн — прежний лагерь и кружок, кадры не будятся", () => {
    const { scene, calls, images } = sceneWith(new Map());
    drawPlayerCamp(scene, at, 2);
    expect(drawn(calls, images)).toEqual(["camp"]);
    expect(texts(calls)).toEqual(["2"]);
    expect(calls.some((c) => c.op === "arc")).toBe(true);
    expect(campOnlineDelay()).toBeNull();
  });

  it("мелкий зум — первый кадр, без будильника; точка зелёная", () => {
    const { scene, calls, images } = sceneWith(new Map([["3,4", 1]]), 0.4);
    drawPlayerCamp(scene, at, 1);
    expect(drawn(calls, images)).toEqual(["online"]);
    expect(calls.find((c) => c.op === "drawImage")?.args[1]).toBe(0);
    expect(calls.some((c) => c.op === "=fillStyle" && c.args[0] === "#37d67a")).toBe(true);
    expect(campOnlineDelay()).toBeNull();
  });

  it("«меньше движения» в системе — без анимации", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const { scene } = sceneWith(new Map([["3,4", 1]]));
    drawPlayerCamp(scene, at, 1);
    expect(campOnlineDelay()).toBeNull();
  });

  it("картинка онлайн ещё не пришла — обычный лагерь", () => {
    const { scene, calls, images } = sceneWith(new Map([["3,4", 1]]), 1, false);
    drawPlayerCamp(scene, at, 1);
    expect(drawn(calls, images)).toEqual(["camp"]);
  });
});
