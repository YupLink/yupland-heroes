// Фишки из пака видны в бою сразу (жалоба 13.11.2026): после открытия пака
// перечитываются ОБА списка фишек — обычные и тренировочные (пак острова), —
// и каждое место, где открывают паки, зовёт общий перечит.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CHIP_QUERY_KEYS, invalidateChipQueries } from "./query";

const tick = () => new Promise((r) => setTimeout(r, 0));

function seed(keys: readonly string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls: string[] = [];
  const fn = (key: string) => async () => {
    calls.push(key);
    return [{ id: `${key}-new` }];
  };
  for (const key of keys) {
    qc.setQueryData([key], [{ id: `${key}-old` }]);
    qc.getQueryCache().find({ queryKey: [key] })!.options.queryFn = fn(key);
  }
  return { qc, calls, fn };
}

describe("ключи фишек", () => {
  it("обычные и тренировочные — в одном списке", () => {
    expect([...CHIP_QUERY_KEYS].sort()).toEqual(["my-chip-inventory", "my-training-chips"]);
  });

  it("после пака перечитаны оба списка, даже закрытые (окна боя на экране нет)", async () => {
    const { qc, calls } = seed(CHIP_QUERY_KEYS);
    invalidateChipQueries(qc);
    await tick();
    expect(calls.sort()).toEqual(["my-chip-inventory", "my-training-chips"]);
  });

  it("пикер при входе освежает только то, что читает; закрытое — помечено", async () => {
    const { qc, calls, fn } = seed(["my-chip-inventory"]);
    qc.setQueryData(["my-training-chips"], []);
    const open = new QueryObserver(qc, {
      queryKey: ["my-training-chips"],
      queryFn: fn("my-training-chips"),
      staleTime: 120_000,
    });
    const stop = open.subscribe(() => {});
    await tick();
    expect(calls).toEqual([]);
    invalidateChipQueries(qc, "active");
    await tick();
    expect(calls).toEqual(["my-training-chips"]);
    expect(qc.getQueryState(["my-chip-inventory"])?.isInvalidated).toBe(true);
    stop();
  });

  it("свежий (в пределах staleTime) список тренировочных после пака не залипает", async () => {
    // Ровно случай жалобы: список прочитан минуту назад, пак открыт, окно боя
    // открывают — пикер (staleTime 120 с) должен увидеть новые фишки.
    const { qc, fn } = seed(["my-training-chips"]);
    invalidateChipQueries(qc);
    await tick();
    const picker = new QueryObserver(qc, {
      queryKey: ["my-training-chips"],
      queryFn: fn("my-training-chips"),
      staleTime: 120_000,
    });
    const stop = picker.subscribe(() => {});
    await tick();
    expect(picker.getCurrentResult().data).toEqual([{ id: "my-training-chips-new" }]);
    stop();
  });
});

/** Все .ts/.tsx клиента (без тестов и сервера). */
function clientFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "server" && name !== "node_modules") out.push(...clientFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("каждое открытие пака перечитывает фишки", () => {
  const src = join(__dirname, "..");
  const files = clientFiles(src).filter((f) => !f.includes(`${join("src", "api")}`));

  it("экраны паков и отряд-пикер зовут invalidateChipQueries", () => {
    const openers = files.filter((f) => /\bopenChipPacks?\(\{/.test(readFileSync(f, "utf8")));
    expect(openers.length).toBeGreaterThanOrEqual(2);
    for (const f of [...openers, join(src, "components", "game", "ChipSquadPicker.tsx")]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/invalidateChipQueries\(/);
    }
  });
});
