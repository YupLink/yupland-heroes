// Гонка Ангелины (09.10): после TG-логина экран сессии висел в «загрузке».
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { resetAccountQueries } from "./resetAccountQueries";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Экран ждёт сессию; первый ответ (до входа) медленный и «без аккаунта». */
function sessionScreen(qc: QueryClient) {
  let calls = 0;
  const obs = new QueryObserver(qc, {
    queryKey: ["session"],
    queryFn: async () => {
      const n = ++calls;
      await wait(n === 1 ? 50 : 10);
      return { wallet: n === 1 ? null : "tg.wallet" };
    },
  });
  const seen: Array<string | null | undefined> = [];
  obs.subscribe((r) => seen.push(r.data?.wallet));
  return { obs, seen, calls: () => calls };
}

describe("resetAccountQueries", () => {
  it("ждущий экран получает новую сессию, ответ до входа не ложится", async () => {
    const qc = new QueryClient();
    const s = sessionScreen(qc);
    await wait(5);
    // Как в мосте: сброс не ждём, следом — общий invalidateQueries.
    void resetAccountQueries(qc);
    qc.invalidateQueries();
    await wait(100);
    expect(s.obs.getCurrentResult().status).toBe("success");
    expect(s.obs.getCurrentResult().data).toEqual({ wallet: "tg.wallet" });
    expect(s.seen).not.toContain(null);
    expect(s.calls()).toBe(2);
  });

  it("removeQueries (как было) — экран навсегда в загрузке", async () => {
    const qc = new QueryClient();
    const s = sessionScreen(qc);
    await wait(5);
    qc.removeQueries({ queryKey: ["session"] });
    qc.invalidateQueries();
    await wait(100);
    expect(s.obs.getCurrentResult().status).toBe("pending");
    expect(s.calls()).toBe(1);
  });

  it("данные прежнего аккаунта без подписчиков выброшены", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["hallway-state"], { owner: "old" });
    qc.setQueryData(["session"], { wallet: "old" });
    await resetAccountQueries(qc);
    expect(qc.getQueryData(["hallway-state"])).toBeUndefined();
    expect(qc.getQueryData(["session"])).toBeUndefined();
  });
});
