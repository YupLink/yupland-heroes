// Что видит админ: полоска «Переместить · <что> · q, r» с «Отмена» и строки
// земли клетки (сундук, мешочки) с «Переместить» — на обоих языках, без
// поясняющих надписей.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const lang = vi.hoisted(() => ({ v: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(lang.v, key, p),
    useLang: () => lang.v,
  };
});

const { GodMoveBar } = await import("@/components/beta-raid/god-move/GodMoveBar");
const { AdminCellGround } = await import("@/components/beta-raid/god-move/AdminCellGround");
type Move = Parameters<typeof GodMoveBar>[0]["move"];

const bar = (from: Move["from"], busy = false) =>
  renderToStaticMarkup(
    <GodMoveBar move={{ from, busy, start: () => true, tap: () => {}, cancel: () => {} }} />,
  ).replace(/<[^>]+>/g, " ");

describe("полоска переноса", () => {
  it("видно, что едет: здание, блок, объект, сундук, мешочки — и откуда", () => {
    lang.v = "ru";
    const b = { q: 4, r: -2, ref: "bld_1", name: "Ратуша" };
    expect(bar({ ...b, kind: "building" })).toContain("Здание · Ратуша · 4, -2");
    expect(bar({ ...b, kind: "building", block: true })).toContain("Блок · Ратуша · 4, -2");
    expect(bar({ ...b, kind: "object", name: "Лесной Бог" })).toContain("Объект · Лесной Бог");
    expect(bar({ ...b, kind: "chest", name: "Сундук" })).toContain("Сундук · Сундук");
    expect(bar({ ...b, kind: "bags", name: "3" })).toContain("Мешочки · 3 · 4, -2");
    expect(bar({ ...b, kind: "decor", name: "Дуб" })).toContain("Отмена");
    lang.v = "en";
    expect(bar({ ...b, kind: "decor", name: "Oak" })).toContain("Decor · Oak · 4, -2");
    expect(bar({ ...b, kind: "decor", name: "Oak" })).toContain("Cancel");
  });

  it("ничего не взято — полоски нет", () => {
    expect(bar(null)).toBe("");
  });
});

describe("земля клетки в окне админа", () => {
  const ground = (g: Parameters<typeof AdminCellGround>[0]["ground"]) =>
    renderToStaticMarkup(<AdminCellGround ground={g} onMove={() => {}} />).replace(/<[^>]+>/g, " ");

  it("сундук с бугорком и мешочки — строки с «Переместить»", () => {
    lang.v = "ru";
    const html = ground({
      chest: { ref: "plain:pc_1", magic: false, name: "Сундук", buried: true },
      bags: { ids: ["lb_a", "lb_b"], buried: 0 },
    });
    expect(html).toContain("Сундук");
    expect(html).toContain("· закопан");
    expect(html).toContain("Мешочки");
    expect(html.match(/Переместить/g)).toHaveLength(2);
  });

  it("пусто — ни строки", () => {
    expect(ground({ chest: null, bags: null })).toBe("");
    expect(ground(undefined)).toBe("");
  });
});
