import { afterEach, describe, expect, it, vi } from "vitest";
import { CASTLE_IMAGE_RETRY_MS, preloadCastleImage } from "./preloadCastleImage";

// Поддельная картинка: исход каждой загрузки задаёт тест (по очереди).
let outcomes: ("ok" | "fail")[] = [];
let decodeFails = false;
const made: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode = () => (decodeFails ? Promise.reject(new Error("EncodingError")) : Promise.resolve());
  constructor() { made.push(this); }
  set src(_: string) {
    const next = outcomes.shift() ?? "ok";
    queueMicrotask(() => (next === "ok" ? this.onload?.() : this.onerror?.()));
  }
}

const run = (live = () => true) => {
  const waits: number[] = [];
  const result = preloadCastleImage("/a.webp", () => {}, live, (ms, go) => {
    waits.push(ms);
    go();
  });
  return { result, waits };
};

describe("preloadCastleImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    outcomes = [];
    decodeFails = false;
    made.length = 0;
  });

  it("пришла с первого раза", async () => {
    vi.stubGlobal("Image", FakeImage);
    const { result, waits } = run();
    expect(await result).toBe(true);
    expect(waits).toEqual([]);
  });

  it("отказ распаковки (decode) — не ошибка: картинка уже пришла", async () => {
    vi.stubGlobal("Image", FakeImage);
    decodeFails = true;
    expect(await run().result).toBe(true);
  });

  it("не пришла — повторяет через 1 и 3 с и берёт со второй попытки", async () => {
    vi.stubGlobal("Image", FakeImage);
    outcomes = ["fail", "fail", "ok"];
    const { result, waits } = run();
    expect(await result).toBe(true);
    expect(waits).toEqual([...CASTLE_IMAGE_RETRY_MS]);
    expect(made).toHaveLength(3);
  });

  it("не пришла и после всех повторов — false", async () => {
    vi.stubGlobal("Image", FakeImage);
    outcomes = ["fail", "fail", "fail"];
    expect(await run().result).toBe(false);
    expect(made).toHaveLength(3);
  });

  it("экран закрыли — повторов нет", async () => {
    vi.stubGlobal("Image", FakeImage);
    outcomes = ["fail"];
    let alive = true;
    const { result } = run(() => alive);
    alive = false;
    expect(await result).toBe(false);
    expect(made).toHaveLength(1);
  });
});
