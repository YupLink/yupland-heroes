// Окно «Вещи героя выпали» (§8.73 п. 4): сводит выпавшее всех строк корзины,
// клетка мешочка, список, снятые артефакты; пустые и старые ответы окна не дают.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";

vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: unknown) => node,
}));
vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));

const { PawnDropDialog } = await import("./PawnDropDialog");
const { closePawnDrop, showPawnDrops } = await import("./pawnDropBus");

beforeEach(() => closePawnDrop());

describe("PawnDropDialog", () => {
  it("нечего показывать — окна нет (старый ответ без поля, пустые)", () => {
    showPawnDrops([undefined, null, { q: 1, r: 1, items: [], arts: 0 }]);
    expect(renderToStaticMarkup(<PawnDropDialog />)).toBe("");
  });

  it("две сделки — одно окно: клетка последней, все стопки, артефакты сложены", () => {
    showPawnDrops([
      { q: 1, r: 2, items: [{ name: "Яблоко", image: null, count: 14 }], arts: 1 },
      { q: 3, r: 4, items: [{ name: "Топор", image: "/t.png", count: 2 }], arts: 2 },
    ]);
    const out = renderToStaticMarkup(<PawnDropDialog />);
    expect(out).toContain("Вещи героя выпали");
    expect(out).toContain("Мешочек на клетке (3, 4)");
    expect(out).toContain("Яблоко");
    expect(out).toContain("×14");
    expect(out).toContain("Топор");
    expect(out).toContain("Надетые артефакты сняты — в инвентаре: 3");
  });

  it("только артефакты — без строки мешочка", () => {
    showPawnDrops([{ q: 1, r: 2, items: [], arts: 1 }]);
    const out = renderToStaticMarkup(<PawnDropDialog />);
    expect(out).not.toContain("Мешочек");
    expect(out).toContain("в инвентаре: 1");
  });

  it("оба языка в словаре", () => {
    for (const k of ["pawndrop.title", "pawndrop.cell", "pawndrop.arts"]) {
      expect(dict[k]?.ru, k).toBeTruthy();
      expect(dict[k]?.en, k).toBeTruthy();
    }
  });
});
