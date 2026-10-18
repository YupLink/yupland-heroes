// Инструменты декора в админке (05.10): выбранные — строками (картинка, имя,
// «×»), ещё один — тем же пикером; на десятом пикер прячется.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: "cst_axe", name: "Топор", image: "/uploads/axe.png" },
      { id: "cst_pick", name: "Кирка", image: null },
    ],
  }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("./market/MarketRefPicker", () => ({
  MarketRefPicker: ({ value }: { value: string | null }) => <i data-picker={String(value)} />,
}));
vi.mock("./market/refPickerSources", () => ({ fetchRefs: async () => [] }));

const { AdminDecorTools } = await import("./AdminDecorTools");
const html = (value: string[]) =>
  renderToStaticMarkup(<AdminDecorTools value={value} onChange={() => {}} />);

describe("AdminDecorTools", () => {
  it("выбранные по порядку — картинка, имя и «×»; ниже пикер ещё одного", () => {
    const out = html(["cst_pick", "cst_axe"]);
    expect(out.indexOf("Кирка")).toBeLessThan(out.indexOf("Топор"));
    expect(out).toContain("axe.png");
    expect(out.match(/aria-label="decor.tool_remove"/g)).toHaveLength(2);
    expect(out).toContain(`data-picker="null"`);
  });

  it("пусто — только пикер; десять — пикера нет", () => {
    expect(html([])).toBe(`<div class="space-y-1.5"><i data-picker="null"></i></div>`);
    const ten = Array.from({ length: 10 }, (_, i) => `cst_t${i}`);
    expect(html(ten)).not.toContain("data-picker");
  });
});
