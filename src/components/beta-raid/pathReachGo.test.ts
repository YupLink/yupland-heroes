// «Идти» с неполным запасом энергии (владелец, 25.10.2026): герой проходит
// только оплаченные шаги и дело в конце не делает — до цели он не дойдёт.
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useT: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), getQueryData: vi.fn() }),
}));
// Хук прибытия живёт на useRef/useEffect — вне рендера даём им простые замены.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (fn: () => void) => void fn(),
}));

import { useApproachDone } from "./useApproachDone";

const path = [
  { q: 1, r: 0, cost: 1 },
  { q: 2, r: 0, cost: 1 },
  { q: 3, r: 0, cost: 1 },
];

function useSetup() {
  const moveAlongPath = vi.fn(async () => true);
  const openBuilding = vi.fn();
  const go = useApproachDone({
    cells: {},
    objects: {},
    pendingPath: path,
    pendingAction: { kind: "build", q: 4, r: 0, extraCost: 0 },
    moveAlongPath,
    openBuilding,
    interact: vi.fn(),
  });
  return { go, moveAlongPath, openBuilding };
}

describe("«Идти» с неполным запасом", () => {
  it("весь путь — идём до конца и открываем постройку", async () => {
    const s = useSetup();
    await s.go(null);
    expect(s.moveAlongPath).toHaveBeenCalledWith(path, undefined);
    expect(s.openBuilding).toHaveBeenCalledTimes(1);
  });

  it("часть пути — только оплаченные шаги, постройку не открываем", async () => {
    const s = useSetup();
    await s.go(2);
    // Весь путь и предел: лоцман судна должен видеть океан впереди.
    expect(s.moveAlongPath).toHaveBeenCalledWith(path, 2);
    expect(s.openBuilding).not.toHaveBeenCalled();
  });

  it("ни шага не оплачено — стоим", async () => {
    const s = useSetup();
    await s.go(0);
    expect(s.moveAlongPath).not.toHaveBeenCalled();
  });
});
