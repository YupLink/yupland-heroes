// Полоса прочности артефакта: внизу картинки, без подписей, при 25 % и ниже
// красная (как процент у инструментов), без данных — полная. Сломанный при
// запущенной механике поломки (§8.63 п.3) — ещё и накладка «сломан» поверх.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return { ...real, useLang: () => "ru" };
});
const mech = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/hooks/useArtBroken", () => ({ useArtBrokenOn: () => mech.on }));

const { ArtWearBar } = await import("./ArtWearBar");
const { shownArtPct } = await import("@/lib/hero/artWear");

const html = (d: number | null | undefined) => renderToStaticMarkup(<ArtWearBar durability={d} />);

describe("ArtWearBar", () => {
  it("полоса поверх нижнего края картинки, ширина — прочность", () => {
    const h = html(62.5);
    expect(h).toContain("absolute inset-x-0 bottom-0");
    expect(h).toContain("width:62.5%");
    expect(h).toContain("bg-gold");
    expect(h).toContain('aria-valuenow="63"');
  });

  it("25 % и ниже — красная, как у инструментов", () => {
    expect(html(25)).toContain("bg-destructive");
    expect(html(26)).not.toContain('class="block h-full bg-destructive"');
  });

  it("сломанный — пустая полоса на красной подложке", () => {
    const h = html(0);
    expect(h).toContain("width:0%");
    expect(h).toContain("bg-destructive/40");
  });

  it("прочность не пришла (новый предмет, старый кэш) — 100 %", () => {
    expect(shownArtPct(undefined)).toBe(100);
    expect(shownArtPct(null)).toBe(100);
    expect(shownArtPct(Number.NaN)).toBe(100);
    expect(shownArtPct(140)).toBe(100);
    expect(html(undefined)).toContain("width:100%");
  });
});

describe("накладка «сломан»", () => {
  it("сломанный при запущенной механике: затемнение, трещины, значок в углу — поверх картинки", () => {
    mech.on = true;
    const h = html(0);
    expect(h).toContain("data-art-broken");
    expect(h).toContain('aria-label="Сломан"');
    expect(h).toContain("absolute inset-0");
    expect(h).toContain("bg-black/50");
    // Трещины — вектор в коде, без растровых файлов; толщина не растягивается.
    expect(h).toContain('viewBox="0 0 100 100"');
    expect(h).toContain('vector-effect="non-scaling-stroke"');
    expect(h).not.toMatch(/\.(png|webp|jpg)/);
    // Значок поломки — расколотый красный кружок в углу (две половинки).
    expect(h).toContain("text-destructive");
    expect(h).toContain('viewBox="-2 -2 28 28"');
    expect(h.match(/A11 11 0 [01] [01] 13 23/g)).toHaveLength(2);
    // Полоса — поверх накладки (рисуется после неё).
    expect(h.indexOf("data-art-broken")).toBeLessThan(h.indexOf('role="meter"'));
  });

  it("механика не запущена — для игроков как было: без накладки", () => {
    mech.on = false;
    expect(html(0)).not.toContain("data-art-broken");
  });

  it("целый и изношенный — без накладки", () => {
    mech.on = true;
    expect(html(0.5)).not.toContain("data-art-broken");
    expect(html(100)).not.toContain("data-art-broken");
    expect(html(undefined)).not.toContain("data-art-broken");
  });
});
