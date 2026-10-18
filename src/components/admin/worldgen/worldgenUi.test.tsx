// Генератор миров глазами админа: форма — название, сид, вид, рамка карты (у
// бесконечного её нет), суша списком; плашка — «Открыть» ведёт в редактор с
// этой картой, «Дорастить» — только у бесконечного мира. ru и en.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorldRow } from "@/server/api/beta-raid/worldgen/api";
import type { WorldDraft } from "./worldDraft";

const ui = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor(ui.lang, key, p),
  };
});

const { WorldCreateForm } = await import("./WorldCreateForm");
const { WorldPlate } = await import("./WorldPlate");

const draft = (o: Partial<WorldDraft> = {}): WorldDraft => ({
  name: "Новый мир",
  seedText: "",
  kind: "map",
  size: 128,
  landPct: null,
  lands: null,
  ...o,
});
const row = (o: Partial<WorldRow> = {}): WorldRow => ({
  mapId: "rmap_SDzQy53h",
  name: "Генерация 128 · тест",
  seed: 593823964,
  endless: false,
  size: 128,
  chunks: 64,
  halls: 7,
  createdAt: "2026-10-06T09:35:00Z",
  ...o,
});
const noop = () => {};
const form = (d: WorldDraft) =>
  renderToStaticMarkup(<WorldCreateForm value={d} onChange={noop} onCreate={noop} busy={false} />);

beforeEach(() => {
  ui.lang = "ru";
});

describe("форма", () => {
  it("карта: рамки 128 и 256, суша списком, «Создать»", () => {
    const out = form(draft());
    for (const part of [
      "Название",
      "Карта",
      "Бесконечный",
      "128 × 128",
      "256 × 256",
      "Как живая карта",
      "30 %",
      "Создать",
    ]) {
      expect(out).toContain(part);
    }
  });

  it("у бесконечного рамки нет; en — Endless, Create", () => {
    expect(form(draft({ kind: "endless" }))).not.toContain("128 × 128");
    ui.lang = "en";
    const out = form(draft());
    expect(out).toContain("Endless");
    expect(out).toContain("Create");
  });

  it("пустое название — «Создать» неактивна", () => {
    expect(form(draft({ name: " " }))).toMatch(/<button[^>]*disabled=""[^>]*>.*Создать/s);
  });

  it("местность: земли живой карты с долей и «Все»; снятая — приглушена", () => {
    const terrains = [
      { id: "t_snow", name: "Снег", image: "/uploads/snow.jpg", share: 40 },
      { id: "t_swamp", name: "Болота", image: null, share: 5 },
    ];
    const out = renderToStaticMarkup(
      <WorldCreateForm
        value={draft({ lands: ["t_snow"] })}
        terrains={terrains}
        onChange={noop}
        onCreate={noop}
        busy={false}
      />,
    );
    for (const part of ["Местность", "Все", "Снег", "40%", "Болота", "5%"]) {
      expect(out).toContain(part);
    }
    // Болота сняты — плитка приглушена; снег отмечен.
    expect(out).toMatch(/opacity-60[^>]*>(?:(?!<\/button>).)*Болота/s);
    expect(form(draft())).not.toContain("Местность");
  });
});

describe("плашка мира", () => {
  it("«Открыть» — редактор с этой картой; у карты нет «Дорастить»", () => {
    const out = renderToStaticMarkup(<WorldPlate row={row()} growing={false} onGrow={noop} />);
    expect(out).toContain('href="/admin/hex-editor?map=rmap_SDzQy53h"');
    expect(out).toContain("чанков: 64");
    expect(out).toContain("ратуш: 7");
    expect(out).not.toContain("Дорастить");
  });

  it("бесконечный мир — «Дорастить»", () => {
    const out = renderToStaticMarkup(
      <WorldPlate row={row({ endless: true })} growing={false} onGrow={noop} />,
    );
    expect(out).toContain("Бесконечный");
    expect(out).toContain("Дорастить");
  });
});
