// Окна «у клетки» перечитываются только открытыми: закрытые копии в кэше —
// ушедшие цели и дальние склады, сервер на них отвечает отказом (02.10).
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { refetchTypeFor } from "./queryWindows";
import { invalidateBackpack, invalidateHeroQueries } from "./query";

describe("refetchTypeFor", () => {
  it("карточка цели и склад — только открытые", () => {
    expect(refetchTypeFor("beta-encounter")).toBe("active");
    expect(refetchTypeFor("beta-warehouse")).toBe("active");
  });
  it("тяжёлые окна героя (снаряжение, предметы) — только открытые", () => {
    expect(refetchTypeFor("my-hero-gear")).toBe("active");
    expect(refetchTypeFor("my-game-items")).toBe("active");
    expect(refetchTypeFor("my-heroes")).toBe("all");
  });
  it("остальное — как было, все копии", () => {
    expect(refetchTypeFor("my-hero-backpack")).toBe("all");
    expect(refetchTypeFor("my-energy")).toBe("all");
  });
});

describe("инвалидации не будят закрытые окна", () => {
  const seed = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const calls: string[] = [];
    for (const key of [
      ["beta-warehouse", 1, 2],
      ["beta-warehouse", 5, 6],
      ["beta-encounter", "boss:x", 1, 1],
      ["my-hero-backpack"],
    ]) {
      // Закрытое окно: данные в кэше есть, наблюдателей нет.
      qc.setQueryData(key, { ok: true });
      qc.getQueryCache().find({ queryKey: key })!.options.queryFn = async () => {
        calls.push(String(key[0]));
        return { ok: true };
      };
    }
    return { qc, calls };
  };

  it("invalidateBackpack: рюкзак перечитан, закрытые склады — нет, но помечены устаревшими", async () => {
    const { qc, calls } = seed();
    invalidateBackpack(qc);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["my-hero-backpack"]);
    expect(qc.getQueryState(["beta-warehouse", 1, 2])?.isInvalidated).toBe(true);
  });

  it("invalidateHeroQueries с карточкой цели: закрытые карточки не перечитываются", async () => {
    const { qc, calls } = seed();
    invalidateHeroQueries(qc, ["beta-encounter"]);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).not.toContain("beta-encounter");
    expect(calls).not.toContain("beta-warehouse");
    expect(qc.getQueryState(["beta-encounter", "boss:x", 1, 1])?.isInvalidated).toBe(true);
  });
});
