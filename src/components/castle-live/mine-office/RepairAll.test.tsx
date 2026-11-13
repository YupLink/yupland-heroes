// «Починить всё»: кнопка горит только при шахте мира с запасом меньше 90 %;
// подтверждение — число шахт, цена, нехватка гасит «Починить».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";

vi.mock("@/server/api/mine-office/mine-office-list", () => ({ getMineOfficeMines: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-act", () => ({ officeRepairMine: vi.fn(), officeSetMineMode: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-claim", () => ({ officeClaimMine: vi.fn(), officeClaimAllMines: vi.fn() }));
vi.mock("@/server/api/mine-office/mine-office-repair-all", () => ({
  getMineRepairAllQuote: vi.fn(),
  repairAllMines: vi.fn(),
}));
vi.mock("@/lib/i18n", async (orig) => ({ ...(await orig<typeof import("@/lib/i18n")>()), useLang: () => "ru" }));

const { ConfirmStep, RepairAll, RepairAllConfirm } = await import("./RepairAll");
const { anyToRepair } = await import("./repairAllReady");
const { MINE_OFFICE_KEY } = await import("@/lib/mineOfficeBus");

const NOW = Date.parse("2026-11-05T12:00:00Z");
const mine = (lifeLeft: number, o: Partial<OfficeMine["view"]> = {}) =>
  ({
    view: {
      mode: "base",
      lifeLeft,
      lifeAt: new Date(NOW).toISOString(),
      breakAt: NOW + lifeLeft * 7 * 24 * 3_600_000,
      broken: false,
      ...o,
    },
  }) as unknown as OfficeMine;

const render = (node: ReactNode, data?: unknown) => {
  const qc = new QueryClient();
  if (data) qc.setQueryData([...MINE_OFFICE_KEY, "repair-all", "saved"], data);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
};

describe("anyToRepair", () => {
  it("полная — нечего; любая неполная — есть (порог ползунок двигает до 100 %); остров и сломанная не в счёт", () => {
    expect(anyToRepair([mine(1)], NOW)).toBe(false);
    expect(anyToRepair([mine(1), mine(0.95)], NOW)).toBe(true);
    expect(anyToRepair([mine(0.5, { island: true })], NOW)).toBe(false);
    expect(anyToRepair([mine(0, { breakAt: NOW - 1 })], NOW)).toBe(false);
  });
});

describe("кнопка и подтверждение", () => {
  it("кнопка погашена, когда чинить нечего", () => {
    expect(render(<RepairAll l="ru" mines={[mine(1)]} now={NOW} />)).toContain('disabled=""');
    const on = render(<RepairAll l="ru" mines={[mine(0.5)]} now={NOW} />);
    expect(on).toContain("Починить всё");
    expect(on).not.toContain('disabled=""');
  });

  it("шаг выбора: ползунок на сохранённом пороге, число шахт и цена; «Починить» ещё не списывает", () => {
    const quote = {
      mines: [{}, {}],
      skipped: [],
      total: { gold: 40 },
      short: {},
      cells: [],
      below: 0.6,
      serverNow: NOW,
    };
    const ok = render(<RepairAllConfirm l="ru" onClose={() => {}} />, quote);
    expect(ok).toContain('type="range"');
    expect(ok).toContain('min="10"');
    expect(ok).toContain('max="100"');
    expect(ok).toContain('value="60"');
    expect(ok.replace(/\u00a0/g, " ")).toContain("Чинить шахты с прочностью ниже <b>60 %</b>");
    expect(ok).toContain("Цена зависит от количества и типа шахт.");
    expect(ok).toContain("Шахт: 2");
    expect(ok).toContain(">40<");
    expect(ok).toContain("Починить<");
    expect(ok).not.toContain("Подтвердить");
    const short = render(<RepairAllConfirm l="ru" onClose={() => {}} />, { ...quote, short: { gold: 15 } });
    expect(short).toContain("Не хватает");
    expect(short).toContain('disabled=""');
  });

  it("шаг подтверждения: сколько шахт и что спишется, «Подтвердить» и «Отмена»", () => {
    const quote = {
      mines: [{}, {}, {}],
      skipped: [],
      total: { gold: 40, diamonds: 1 },
      short: {},
      cells: [],
      below: 0.9,
      serverNow: NOW,
    } as never;
    const html = render(<ConfirmStep l="ru" quote={quote} onBack={() => {}} onDone={() => {}} />);
    expect(html).toContain("Будет починено шахт: 3");
    expect(html).toContain("Спишется");
    expect(html).toContain(">40<");
    expect(html).toContain(">1<");
    expect(html).toContain("Подтвердить");
    expect(html).toContain("Отмена");
    expect(html).not.toContain('disabled=""');
  });

  it("чинить нечего — без кнопки «Починить»", () => {
    const html = render(<RepairAllConfirm l="ru" onClose={() => {}} />, {
      mines: [],
      skipped: [],
      total: {},
      short: {},
      cells: [],
      serverNow: NOW,
    });
    expect(html).toContain("Чинить нечего");
    expect(html).not.toContain("mb-gold");
  });
});

