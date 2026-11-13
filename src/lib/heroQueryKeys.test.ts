// Ключи героя: Архитектор (флаг «Строитель» у выбранного героя) перечитывается
// со сменой героя без F5 — открытый сразу, закрытый только помечается
// устаревшим (сцена замка перечитает при входе). Прочие ключи — как были.
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { HERO_QUERY_KEYS, invalidateHeroQueries } from "./query";

const tick = () => new Promise((r) => setTimeout(r, 0));

function seed(keys: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls: string[] = [];
  const fn = (key: string) => async () => {
    calls.push(key);
    return { ok: true };
  };
  for (const key of keys) {
    qc.setQueryData([key], { ok: true });
    qc.getQueryCache().find({ queryKey: [key] })!.options.queryFn = fn(key);
  }
  return { qc, calls, fn };
}

describe("ключи героя", () => {
  it("Архитектор в списке; реэкспорт из query.ts — тот же список", () => {
    expect(HERO_QUERY_KEYS).toContain("castle-architect");
    expect(HERO_QUERY_KEYS).toContain("my-selected-hero");
  });

  it("закрытый Архитектор не будим, но помечаем; закрытый список героев — перечитан", async () => {
    const { qc, calls } = seed(["castle-architect", "my-heroes"]);
    invalidateHeroQueries(qc);
    await tick();
    expect(calls).toEqual(["my-heroes"]);
    expect(qc.getQueryState(["castle-architect"])?.isInvalidated).toBe(true);
  });

  it("открытый Архитектор (сцена замка) перечитывается сразу", async () => {
    const { qc, calls, fn } = seed([]);
    qc.setQueryData(["castle-architect"], { ok: true });
    const open = new QueryObserver(qc, {
      queryKey: ["castle-architect"],
      queryFn: fn("castle-architect"),
      staleTime: Infinity,
    });
    const stop = open.subscribe(() => {});
    await tick();
    expect(calls).toEqual([]);
    invalidateHeroQueries(qc);
    await tick();
    expect(calls).toEqual(["castle-architect"]);
    stop();
  });
});
