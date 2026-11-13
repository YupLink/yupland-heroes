// Уровень шахты в окне (§8.74): кружок у полосы запаса (и у «Шахта сломана»),
// своя работающая — «сейчас → дальше в час» и «Улучшить за [цена]»; не Строитель —
// выключенная кнопка «Нужен Строитель»; предел — «Максимальный уровень»; остров и
// чужая — без улучшения. Оба языка в словаре.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { dict } from "@/lib/translations";
import { dict as levelDict } from "@/lib/translations/braid-mine-level";
import type { MineV2View } from "@/lib/mineExtra";
import type { MineV2Stamped } from "@/lib/mineV2Clock";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
      String(vars?.[k] ?? ""),
    ),
}));
vi.mock("@/lib/humanError", () => ({ humanError: (e: Error) => e.message }));
vi.mock("@/server/api/beta-raid/mine-capture", () => ({ captureMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-claim", () => ({ claimMine: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-v2", () => ({ repairMine: vi.fn(), setMineMode: vi.fn() }));
vi.mock("@/server/api/beta-raid/mine-upgrade", () => ({ upgradeMine: vi.fn() }));
vi.mock("@/lib/hooks/useResources", () => ({
  RESOURCES_KEY: ["my-resources"],
  useResources: () => ({ data: { gold: 5, stone: 0, diamonds: 0, wood: 120 } }),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));
vi.mock("@/lib/hooks/useAccountBalances", () => ({ ACC_BALANCES_KEY: ["acc-balances"] }));
vi.mock("@/lib/hooks/useMinePendings", () => ({ MINE_PENDINGS_KEY: ["mine-pendings"] }));
vi.mock("../hud/useHarvest", () => ({ HARVEST_KEY: ["beta-raid-harvest"] }));
vi.mock("./mineGuardsQuery", () => ({ MINE_GUARDS_KEY: ["beta-raid-mine-guards"] }));
vi.mock("./MineGuardOwnerBlock", () => ({ MineGuardOwnerBlock: () => <i>guard-own</i> }));
vi.mock("./MineGuardFight", () => ({ MineGuardFight: () => <i>guard-fight</i> }));

const { MineAction } = await import("../MineAction");

const H = 3_600_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

/** «Бережно», прошло 3,5 дня из 7: запас 50 %, до поломки 84 ч. */
const working: MineV2View = {
  mode: "base",
  lifeLeft: 1,
  lifeAt: new Date(NOW - 84 * H).toISOString(),
  breakAt: NOW + 84 * H,
  broken: false,
  stdYield: 10,
  mult: 1,
  repairCost: { gold: 20 },
};
const broken: MineV2View = {
  ...working,
  lifeLeft: 0,
  lifeAt: new Date(NOW).toISOString(),
  breakAt: NOW,
  broken: true,
};

type Props = ComponentProps<typeof MineAction>;
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
const mine = (over: Partial<Props>) =>
  render(
    <MineAction
      q={3}
      r={-4}
      resource="wood"
      token={null}
      yieldAmount={10}
      captureCost={10}
      mine="own"
      capturedAt={NOW - 2 * H}
      claimedHours={0}
      maxHours={86}
      pending={20}
      guardian={null}
      v2={working}
      can={false}
      reasonKey={null}
      onDone={() => {}}
      {...over}
    />,
  );

describe("уровень шахты в окне", () => {
  it("своя, Строитель: кружок, добыча сейчас → дальше, цена шага", () => {
    lang.now = "ru";
    const out = mine({ v2: { ...working, stdYield: 20, level: 2, builder: true } });
    expect(out).toContain('aria-label="Уровень шахты 2"');
    expect(out).toContain("20 → 30 в час");
    expect(out).toMatch(/Улучшить за.*alt="алмазы".*2/);
    expect(out).not.toContain("Нужен Строитель");
  });

  it("не Строитель — кнопка выключена со статусом", () => {
    lang.now = "ru";
    const out = mine({ v2: { ...working, level: 1, builder: false } });
    expect(out).toMatch(/disabled[^>]*>.*Нужен Строитель/);
    expect(out).not.toContain("Улучшить за");
  });

  it("предел — «Максимальный уровень»; золото улучшается: 5 → 10 за алмаз", () => {
    lang.now = "ru";
    expect(mine({ v2: { ...working, level: 4, builder: true } })).toContain("Максимальный уровень");
    const gold = mine({ resource: "gold", v2: { ...working, stdYield: 5, builder: true } });
    expect(gold).toContain("5 → 10 в час");
    expect(gold).toMatch(/Улучшить за.*alt="алмазы".*1/);
  });

  it("чужая — кружок есть, улучшения нет; остров — ни того, ни другого", () => {
    lang.now = "ru";
    const enemy = mine({ mine: "enemy", v2: { ...working, level: 3 } });
    expect(enemy).toContain('aria-label="Уровень шахты 3"');
    expect(enemy).not.toContain("Улучшить");
    const isle = mine({ v2: { ...working, island: true, builder: true } });
    expect(isle).not.toContain("Уровень шахты");
    expect(isle).not.toContain("Улучшить");
  });

  it("сломанная — уровень остаётся в кружке", () => {
    lang.now = "ru";
    const out = mine({ mine: "free", v2: { ...broken, level: 3 } });
    expect(out).toContain("Шахта сломана");
    expect(out).toContain('aria-label="Уровень шахты 3"');
  });

  it("оба языка в словаре", () => {
    for (const [key, e] of Object.entries(levelDict)) {
      expect(e.ru, key).toBeTruthy();
      expect(e.en, key).toBeTruthy();
    }
    lang.now = "en";
    expect(mine({ v2: { ...working, level: 1, builder: true } })).toContain("Upgrade for");
  });
});
