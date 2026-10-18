// «Открыть · N⚡» (ПРАВИЛА §8.23): цена — от сервера, не меньше 1 (пустой
// сундук — 1); энергии меньше цены — кнопка неактивна и говорит, сколько
// нужно. Оба языка.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";

const v = vi.hoisted(() => ({ lang: "ru" as "ru" | "en", energy: 10 as number | undefined }));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[v.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({
  useEnergy: () => ({ data: v.energy == null ? undefined : { energy: v.energy } }),
}));

const { OpenButton } = await import("@/components/beta-raid/open-pass/OpenButton");
const html = (price: number, busy = false) =>
  renderToStaticMarkup(<OpenButton price={price} busy={busy} onOpen={() => {}} />);

beforeEach(() => Object.assign(v, { lang: "ru", energy: 10 }));

describe("кнопка входа", () => {
  it("цена в кнопке; хватает энергии — активна", () => {
    const h = html(3);
    expect(h).toContain("Открыть · 3⚡");
    expect(h).not.toContain('disabled=""');
  });

  it("пустой сундук — тоже 1⚡ (цена не меньше 1, как спишет сервер)", () => {
    expect(html(1)).toContain("Открыть · 1⚡");
    // Ответ прошлой версии с нулём — всё равно 1: сервер спишет 1.
    expect(html(0)).toContain("Открыть · 1⚡");
  });

  it("энергии нет совсем — даже пустой не открыть: «Нужно 1 энергии»", () => {
    v.energy = 0;
    const h = html(0);
    expect(h).toContain('disabled=""');
    expect(h).toContain("Нужно 1 энергии");
  });

  it("энергии меньше цены — неактивна и «Нужно N энергии»", () => {
    v.energy = 2;
    const h = html(3);
    expect(h).toContain('disabled=""');
    expect(h).toContain("Нужно 3 энергии");
  });

  it("энергия ещё не пришла — не гасим: решит сервер", () => {
    v.energy = undefined;
    expect(html(3)).not.toContain('disabled=""');
  });

  it("английский", () => {
    v.lang = "en";
    expect(html(2)).toContain("Open · 2⚡");
  });
});
