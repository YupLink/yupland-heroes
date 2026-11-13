// Окно шахты острова новичка (ПРАВИЛА §8.59 п. 11): своя — без режимов, без
// починки и без охраны, «истощится через …»; алмазная — «1 алмаз в день» и сбор
// только целыми сутками; выработанная — «Шахта истощена» без кнопки; новая
// ничья — «Починить за … и забрать» по цене острова. Плюс строка «Добычи».
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { dict } from "@/lib/translations";
import type { MineV2View } from "@/lib/mineExtra";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

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
const { MineList } = await import("../hud/HarvestLists");

const H = 3_600_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

/** Алмазная острова, починена 30 ч назад: до истощения 138 ч. */
const diamonds: MineV2View = {
  mode: "base",
  lifeLeft: 1,
  lifeAt: new Date(NOW - 30 * H).toISOString(),
  breakAt: NOW + 138 * H,
  broken: false,
  stdYield: 1 / 24,
  mult: 1,
  repairCost: { wood: 100, stone: 100 },
  island: true,
  spent: true,
  stepHours: 24,
};
const fresh: MineV2View = { ...diamonds, lifeLeft: 0, breakAt: NOW, broken: true, spent: false };

type Props = ComponentProps<typeof MineAction>;
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
const mine = (over: Partial<Props>) =>
  render(
    <MineAction
      q={1}
      r={2}
      resource="diamonds"
      token={null}
      yieldAmount={1 / 24}
      captureCost={0}
      mine="own"
      capturedAt={NOW - 30 * H}
      claimedHours={0}
      maxHours={168}
      pending={0}
      guardian={null}
      v2={diamonds}
      can={false}
      reasonKey={null}
      onDone={() => {}}
      {...over}
    />,
  );

describe("окно шахты острова", () => {
  it("алмазная своя: «1 алмаз в день», сбор за целые сутки, без режимов/починки/охраны", () => {
    lang.now = "ru";
    const out = mine({});
    expect(out).toContain("1 алмаз в день");
    expect(out).toContain("Собрать 1 алмазы");
    expect(out).toContain("истощится через 5 д 18 ч");
    for (const gone of ["Усердно", "На износ", "Починить", "guard-own", "сломается"])
      expect(out).not.toContain(gone);
  });

  it("неполные сутки — собирать нечего (сервер платит только сутками)", () => {
    lang.now = "ru";
    const out = mine({ capturedAt: NOW - 20 * H, v2: { ...diamonds, breakAt: NOW + 148 * H } });
    expect(out).toContain("Пока нечего собирать");
    expect(out).not.toContain("Собрать ");
  });

  it("дерево острова: 1 в час, без режимов и охраны", () => {
    lang.now = "en";
    const wood = { ...diamonds, stdYield: 1, stepHours: 1 };
    const out = mine({ resource: "wood", yieldAmount: 1, v2: wood });
    expect(out).toContain("1 wood per hour");
    expect(out).toContain("Collect 30 wood");
    expect(out).toContain("runs out in");
    expect(out).not.toContain("Hard");
    expect(out).not.toContain("guard-own");
  });

  it("выработанная: «Шахта истощена», ни починки, ни захвата", () => {
    lang.now = "ru";
    const out = mine({ mine: "free", v2: { ...fresh, spent: true } });
    expect(out).toContain("Шахта истощена");
    for (const gone of ["Починить", "Захватить", "Шахта сломана"]) expect(out).not.toContain(gone);
    lang.now = "en";
    expect(mine({ mine: "free", v2: { ...fresh, spent: true } })).toContain(
      "The mine is exhausted",
    );
  });

  it("новая ничья: «Починить за 100 дерева + 100 камня и забрать»", () => {
    lang.now = "ru";
    const out = mine({ mine: "free", v2: fresh });
    expect(out).toContain("Шахта сломана");
    expect(out).toMatch(/Починить за.*alt="дерево".*100.*alt="камень".*100.*и забрать/);
    // §8.70: на острове не разбирают.
    expect(out).not.toContain("Разобрать");
  });
});

describe("строка «Добычи»", () => {
  const row: MineRow = {
    mapId: "isle_x",
    q: 1,
    r: 2,
    resource: "diamonds",
    token: null,
    yield: 1 / 24,
    claimedHours: 0,
    capturedAt: NOW - 30 * H,
    maxHours: 168,
    stepHours: 24,
  };
  it("алмаз острова: выход в день, готово — целые сутки", () => {
    lang.now = "ru";
    const out = render(<MineList mines={[row]} />);
    expect(out).toContain("1 в день");
    expect(out).toContain("готово 1");
    expect(render(<MineList mines={[{ ...row, capturedAt: NOW - 20 * H }]} />)).not.toContain(
      "готово",
    );
  });
});
