// Отметка зачарованного экземпляра (§8.87): ✦ золотом, «+N%» / «−N%» где есть
// место, подпись «Зачарован ±N%» в title и aria; без зачарования — пусто.
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let lang = "ru";
vi.mock("@/lib/i18n", () => ({ useLang: () => lang }));

const { EnchantMark, enchantMarkLabel, enchantPctOf } = await import("./EnchantMark");

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("EnchantMark", () => {
  it("плюс: ✦, «+12%» рядом и подпись «Зачарован +12%»", () => {
    lang = "ru";
    const out = html(<EnchantMark pct={12} show="pct" />);
    expect(out).toContain("✦");
    expect(out).toContain(">+12%<");
    expect(out).toContain('title="Зачарован +12%"');
    expect(out).toContain('aria-label="Зачарован +12%"');
    expect(out).toContain("text-gold");
  });

  it("минус — типографским минусом; по-английски «Enchanted −20%»", () => {
    lang = "en";
    const out = html(<EnchantMark pct={-20} show="text" />);
    expect(out).toContain('title="Enchanted −20%"');
    expect(out).toContain(">Enchanted −20%<");
    lang = "ru";
  });

  it("только ✦ по умолчанию и в углу картинки (у угла процента нет)", () => {
    const icon = html(<EnchantMark pct={5} />);
    expect(icon).toContain("✦");
    expect(icon).not.toContain(">+5%<");
    const corner = html(<EnchantMark pct={5} corner show="pct" />);
    expect(corner).toContain("absolute");
    expect(corner).not.toContain(">+5%<");
  });

  it("нет зачарования — ничего не рисует (null, undefined, мусор)", () => {
    expect(html(<EnchantMark pct={null} />)).toBe("");
    expect(html(<EnchantMark pct={undefined} />)).toBe("");
    expect(html(<EnchantMark pct={Number.NaN} />)).toBe("");
    expect(enchantPctOf("")).toBeNull();
    expect(enchantPctOf("7")).toBe(7);
  });

  it("стопка, где экземпляры не различить: «… · 1 из 5»; одна штука — без хвоста", () => {
    expect(enchantMarkLabel(10, true, { n: 1, total: 5 })).toBe("Зачарован +10% · 1 из 5");
    expect(enchantMarkLabel(10, false, { n: 2, total: 3 })).toBe("Enchanted +10% · 2 of 3");
    expect(enchantMarkLabel(10, true, { n: 1, total: 1 })).toBe("Зачарован +10%");
  });
});
