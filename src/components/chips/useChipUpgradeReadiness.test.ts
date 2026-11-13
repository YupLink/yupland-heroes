import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { tFor } from "@/lib/i18n";

vi.mock("@/server/api/chips-upgrade-ready", () => ({ getChipUpgradeReadiness: vi.fn() }));
const { UPGRADE_READY_KEY, watchUpgradeSources } = await import("./useChipUpgradeReadiness");
const { upgradeBlockText } = await import("@/lib/chips/upgradeBlock");

describe("фильтр «можно улучшить»", () => {
  it("обновились фишки или золото — ответ устарел; прочее не трогает", () => {
    const qc = new QueryClient();
    qc.setQueryData(UPGRADE_READY_KEY, { haveGold: 0, chips: {} });
    const stop = watchUpgradeSources(qc);
    const stale = () => qc.getQueryState(UPGRADE_READY_KEY)?.isInvalidated;
    qc.setQueryData(["beta-raid-state"], 1);
    qc.setQueryData(["my-tickets"], { available: 5 });
    expect(stale()).toBe(false);
    qc.setQueryData(["my-resources"], { gold: 500, stone: 0, diamonds: 0, wood: 0 });
    expect(stale()).toBe(true);
    qc.setQueryData(UPGRADE_READY_KEY, { haveGold: 500, chips: {} });
    qc.setQueryData(["my-chip-inventory"], []);
    expect(stale()).toBe(true);
    stop();
  });

  it("причины по-русски и по-английски", () => {
    const ru = (k: string, p?: Record<string, string | number>) => tFor("ru", k, p);
    const en = (k: string, p?: Record<string, string | number>) => tFor("en", k, p);
    expect(upgradeBlockText({ kind: "gold", need: 1059, have: 120 }, ru)).toBe(
      "Не хватает золота: нужно 1059, у тебя 120",
    );
    expect(upgradeBlockText({ kind: "gold", need: 9, have: 0 }, en)).toBe(
      "Not enough gold: need 9, you have 0",
    );
    expect(
      upgradeBlockText(
        {
          kind: "chips",
          shortfall: [
            { level: 1, count: 4 },
            { level: 1.5, count: 2 },
          ],
        },
        ru,
      ),
    ).toBe("Не хватает фишек: 4 × 1★, 2 × 1.5★");
    expect(upgradeBlockText({ kind: "same_type", level: 2.5 }, en)).toBe(
      "Needs chips of the same kind, 2.5★",
    );
    for (const kind of ["listed", "studying", "unavailable", "max", "no_rules"] as const)
      expect(upgradeBlockText({ kind }, ru)).not.toContain("chips.");
    expect(upgradeBlockText({ kind: "resting", until: "x" }, en)).toBe("Resting");
  });
});
