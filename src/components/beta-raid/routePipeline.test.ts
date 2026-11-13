// Шаги наперёд (routePipeline): на виртуальных часах — сеть с пингом, кони разного темпа.
// Главное — ход в темпе коня, а не сети (владелец: «ускорение примерно в 2 раза»), отказ
// сервера и «Стоп» не уводят героя дальше принятого, тормоз частоты не задевается.
import { describe, expect, it } from "vitest";
import { BASE_STEP_MS, STEP_WINDOW_MS, mountStepMs, stepRateLimit } from "@/lib/hero/mount";
import { chunkSize, runPipeline } from "./routePipeline";

/** Виртуальные часы: таймеры по времени, «прокрутка» до конца. */
function clock() {
  let t = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const later = (ms: number, fn: () => void) => timers.push({ at: t + ms, fn });
  return {
    now: () => t,
    sleep: (ms: number) => new Promise<void>((res) => later(ms, res)),
    after: <T>(ms: number, v: () => T) => new Promise<T>((res) => later(ms, () => res(v()))),
    async run(p: Promise<unknown>) {
      let done = false;
      void p.then(() => (done = true));
      for (let guard = 0; guard < 100_000 && !done; guard++) {
        await new Promise((r) => setTimeout(r, 0));
        if (done) break;
        timers.sort((a, b) => a.at - b.at);
        const next = timers.shift();
        if (!next) continue;
        t = Math.max(t, next.at);
        next.fn();
      }
    },
  };
}

type Sent = { at: number; from: number; count: number };

function sim(o: { total: number; stepMs: number; rtt: number; failAt?: number; stopAt?: number }) {
  const c = clock();
  const sent: Sent[] = [];
  const animatedAt: number[] = [];
  const p = runPipeline<number>({
    total: o.total,
    stepMs: o.stepMs,
    now: c.now,
    sleep: c.sleep,
    stopped: () => o.stopAt != null && c.now() >= o.stopAt,
    send: (from, count) => {
      sent.push({ at: c.now(), from, count });
      // Сервер: каждый шаг ~10 мс, отказ на шаге failAt.
      const ok: number[] = [];
      let error: unknown = null;
      for (let i = from; i < from + count; i++) {
        if (i === o.failAt) {
          error = new Error("braid.no_energy");
          break;
        }
        ok.push(i);
      }
      return c.after(o.rtt + 10 * count, () => ({ ok, error }));
    },
    onConfirm: () => {},
    onAnimate: () => animatedAt.push(c.now()),
  });
  return { c, p, sent, animatedAt };
}

describe("шаги наперёд", () => {
  it("размер пачки — от пинга и темпа: медленному 1, пегасу на плохой сети до 4", () => {
    expect(chunkSize(150, mountStepMs("none"))).toBe(1);
    expect(chunkSize(150, mountStepMs("unique"))).toBe(2);
    expect(chunkSize(400, mountStepMs("unique"))).toBe(4);
  });

  it("пегас на пинге 200 мс идёт почти вдвое быстрее, чем раньше шёл любой герой", async () => {
    const { c, p, animatedAt } = sim({ total: 60, stepMs: mountStepMs("unique"), rtt: 200 });
    await c.run(p);
    const end = await p;
    expect(end).toEqual({ animated: 60, confirmed: 60, error: null });
    // Раньше: каждый шаг = max(190 мс анимации, пинг + сервер) — 210 мс.
    const before = 60 * Math.max(BASE_STEP_MS, 200 + 10);
    const after = animatedAt[59] + mountStepMs("unique");
    expect(before / after).toBeGreaterThan(1.85);
    // Шаги идут ровно в темпе коня: после старта фигурка нигде не ждёт сеть.
    for (let i = 1; i < 60; i++) {
      expect(animatedAt[i] - animatedAt[i - 1]).toBe(mountStepMs("unique"));
    }
  });

  it("без коня — медленнее прежнего, но не ждёт сеть", async () => {
    const { c, p, animatedAt } = sim({ total: 12, stepMs: mountStepMs("none"), rtt: 300 });
    await c.run(p);
    for (let i = 1; i < 12; i++) {
      expect(animatedAt[i] - animatedAt[i - 1]).toBe(mountStepMs("none"));
    }
  });

  it("отказ сервера — герой встаёт на последнем принятом, дальше ничего не шлём", async () => {
    const { c, p, sent } = sim({ total: 20, stepMs: mountStepMs("epic"), rtt: 150, failAt: 7 });
    await c.run(p);
    const end = await p;
    expect(end.animated).toBe(7);
    expect(end.confirmed).toBe(7);
    expect(end.error).toBeInstanceOf(Error);
    expect(sent.at(-1)!.from).toBeLessThanOrEqual(7);
    expect(sent.at(-1)!.from + sent.at(-1)!.count).toBeGreaterThan(7);
  });

  it("«Стоп» — новых пачек нет, фигурка добегает только принятое (≤ окна)", async () => {
    const stepMs = mountStepMs("unique");
    const { c, p, sent, animatedAt } = sim({ total: 40, stepMs, rtt: 200, stopAt: 1000 });
    await c.run(p);
    const end = await p;
    expect(end.animated).toBe(end.confirmed);
    const atStop = animatedAt.filter((t) => t <= 1000).length;
    expect(end.animated - atStop).toBeLessThanOrEqual(2 * chunkSize(200, stepMs));
    expect(sent.every((s) => s.at <= 1000)).toBe(true);
  });

  it("обрыв связи — стоим на принятом, ошибка наружу", async () => {
    const c = clock();
    let n = 0;
    const p = runPipeline<number>({
      total: 10,
      stepMs: 109,
      now: c.now,
      sleep: c.sleep,
      stopped: () => false,
      send: (from, count) => {
        n++;
        if (n === 2) return Promise.reject(new Error("network"));
        return c.after(150, () => ({
          ok: Array.from({ length: count }, (_, k) => from + k),
          error: null,
        }));
      },
      onConfirm: () => {},
      onAnimate: () => {},
    });
    await c.run(p);
    const end = await p;
    expect(end.animated).toBe(end.confirmed);
    expect((end.error as Error).message).toBe("network");
  });

  it("тормоз частоты сервера не задевается ни на одном коне", async () => {
    for (const tier of ["none", "common", "rare", "epic", "legendary", "unique"] as const) {
      const stepMs = mountStepMs(tier);
      for (const rtt of [40, 150, 400]) {
        const { c, p, sent } = sim({ total: 80, stepMs, rtt });
        await c.run(p);
        // Шаги приходят на сервер пачкой в момент ответа отправки — худшее окно.
        const arrivals = sent.flatMap((s) => Array.from({ length: s.count }, () => s.at + rtt));
        for (const a of arrivals) {
          const inWindow = arrivals.filter((x) => x >= a && x < a + STEP_WINDOW_MS).length;
          expect(inWindow).toBeLessThanOrEqual(stepRateLimit(tier));
        }
      }
    }
  });

  it("сбой разбора ответа — конец пути, а не вечное «идём»", async () => {
    const c = clock();
    const p = runPipeline<number>({
      total: 10,
      stepMs: 109,
      now: c.now,
      sleep: c.sleep,
      stopped: () => false,
      send: (from, count) =>
        c.after(150, () => ({
          ok: Array.from({ length: count }, (_, k) => from + k),
          error: null,
        })),
      onConfirm: (i) => {
        if (i === 3) throw new Error("cache");
      },
      onAnimate: () => {},
    });
    await c.run(p);
    const end = await p;
    expect((end.error as Error).message).toBe("cache");
    expect(end.animated).toBe(end.confirmed);
  });

  it("скачки пинга (40 ↔ 600 мс) тоже не задевают тормоз сервера", async () => {
    for (const tier of ["none", "common", "rare", "epic", "unique"] as const) {
      const c = clock();
      const arrivals: number[] = [];
      let k = 0;
      const p = runPipeline<number>({
        total: 120,
        stepMs: mountStepMs(tier),
        now: c.now,
        sleep: c.sleep,
        stopped: () => false,
        send: (from, count) => {
          const ping = k++ % 3 === 0 ? 600 : 40;
          return c.after(ping + 10 * count, () => {
            for (let n = 0; n < count; n++) arrivals.push(c.now());
            return { ok: Array.from({ length: count }, (_, n) => from + n), error: null };
          });
        },
        onConfirm: () => {},
        onAnimate: () => {},
      });
      await c.run(p);
      for (const a of arrivals) {
        const inWindow = arrivals.filter((x) => x >= a && x < a + STEP_WINDOW_MS).length;
        expect(inWindow).toBeLessThanOrEqual(stepRateLimit(tier));
      }
    }
  });
});
