import { describe, expect, it } from "vitest";
import { FALLBACK_MS, makeFrameScheduler, type FrameEnv } from "./frameNotify";

function fakeEnv(hidden = false) {
  const frames: Array<() => void> = [];
  const timers: Array<{ cb: () => void; ms: number }> = [];
  const env: FrameEnv = {
    frame: (cb) => frames.push(cb),
    timeout: (cb, ms) => timers.push({ cb, ms }),
    hidden: () => hidden,
  };
  return { env, frames, timers };
}

describe("makeFrameScheduler", () => {
  it("всё, что пришло до кадра, выполняет одним вызовом кадра", () => {
    const { env, frames } = fakeEnv();
    const schedule = makeFrameScheduler(env);
    const log: string[] = [];
    schedule(() => log.push("energy"));
    schedule(() => log.push("state"));
    expect(frames).toHaveLength(1);
    expect(log).toEqual([]);
    frames[0]();
    expect(log).toEqual(["energy", "state"]);
  });

  it("запасной таймер выполняет пачку, если кадра нет, и не повторяет её", () => {
    const { env, frames, timers } = fakeEnv();
    const schedule = makeFrameScheduler(env);
    let n = 0;
    schedule(() => n++);
    expect(timers.map((t) => t.ms)).toEqual([FALLBACK_MS]);
    timers[0].cb();
    expect(n).toBe(1);
    frames[0]();
    expect(n).toBe(1);
  });

  it("после выполненной пачки новая задача ждёт свой кадр", () => {
    const { env, frames } = fakeEnv();
    const schedule = makeFrameScheduler(env);
    const log: number[] = [];
    schedule(() => log.push(1));
    frames[0]();
    schedule(() => log.push(2));
    expect(frames).toHaveLength(2);
    frames[1]();
    expect(log).toEqual([1, 2]);
  });

  it("в фоне не ждёт кадра — сразу таймер", () => {
    const { env, frames, timers } = fakeEnv(true);
    const schedule = makeFrameScheduler(env);
    let n = 0;
    schedule(() => n++);
    expect(frames).toHaveLength(0);
    expect(timers.map((t) => t.ms)).toEqual([0]);
    timers[0].cb();
    expect(n).toBe(1);
  });

  it("ошибка одного подписчика не мешает остальным", async () => {
    const { env, frames } = fakeEnv();
    const schedule = makeFrameScheduler(env);
    const log: string[] = [];
    const errors: unknown[] = [];
    const prev = globalThis.queueMicrotask;
    globalThis.queueMicrotask = (cb: () => void) => {
      try {
        cb();
      } catch (e) {
        errors.push(e);
      }
    };
    try {
      schedule(() => {
        throw new Error("boom");
      });
      schedule(() => log.push("ok"));
      frames[0]();
    } finally {
      globalThis.queueMicrotask = prev;
    }
    expect(log).toEqual(["ok"]);
    expect(errors).toHaveLength(1);
  });
});
