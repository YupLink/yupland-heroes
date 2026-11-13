// Панель запасов замка: дроби — вниз до целого (владелец, 21.10.2026).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/hooks/useResources", () => ({
  useResources: () => ({
    data: { wood: 548.62, stone: 14.69, gold: 549.064, diamonds: 0.621 },
    isError: false,
  }),
}));
vi.mock("./castle-resource-dock.css", () => ({}));

const { CastleResourceDock } = await import("./CastleResourceDock");

describe("панель запасов замка", () => {
  it("дробные запасы показываются целыми, округление вниз", () => {
    const html = renderToStaticMarkup(<CastleResourceDock ru />);
    for (const n of ["548", "14", "0"]) expect(html).toContain(`>${n}<`);
    for (const frac of ["548,62", "14,69", "0,621"]) expect(html).not.toContain(frac);
  });

  it("золота в нижней панели нет — оно в шапке (§8.66), прочие запасы на месте", () => {
    const html = renderToStaticMarkup(<CastleResourceDock ru />);
    expect(html).not.toContain("/resources/gold.webp");
    expect(html).not.toContain("Золото");
    for (const icon of ["wood", "stone", "crystal"]) expect(html).toContain(`/resources/${icon}.webp`);
  });
});
