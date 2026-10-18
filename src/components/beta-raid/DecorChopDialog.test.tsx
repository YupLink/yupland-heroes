// Окно «Срубить (−1 Топор)»: без инструмента кнопка неактивна и зовёт «Нужен
// Топор»; с ним — «Срубить (−1 Топор)». Имя — от товара, не жёстко «топор».
// Надпись действия шаблона (29.09) заменяет «Срубить» в кнопке и встаёт в заголовок.
// Основной инструмент (§8.24): есть, но в руках другое — «Взять Топор», активна.
// Несколько инструментов (05.10): имя и износ — того, которым рубят; нечем —
// «Требуется Пила или Топор».
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { dict as decorDict } from "@/lib/translations/braid-decor";
import { dict as toolDict } from "@/lib/translations/braid-tool";

const dict = { ...decorDict, ...toolDict };

const ui = vi.hoisted(() => ({ lang: "ru" as "ru" | "en" }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string>) =>
    (dict[key]?.[ui.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => vars?.[k] ?? ""),
  useLang: () => ui.lang,
}));

// Окно уходит порталом в document.body; в node его нет — хватит заглушки.
vi.stubGlobal("document", { body: {} });

const { DecorChopDialog } = await import("./DecorChopDialog");
const conf = {
  cost: 2,
  itemId: "cst_wood",
  amount: "1-3",
  toolItemId: "cst_saw",
  name: "Сосна",
  itemName: "Дерево",
  itemImage: null,
  toolName: "Пила",
  toolImage: null,
};
type View = { id: string; name: string; image: string | null; wear: number | null; key: string };
type Extra = { label?: { ru?: string; en?: string }; toolWear?: number; tools?: View[] };
const html = (hasTool: boolean | "idle", extra: Extra = {}, used: View | null = null) =>
  renderToStaticMarkup(
    <DecorChopDialog
      conf={{ ...conf, ...extra }}
      tool={hasTool === "idle" ? "idle" : hasTool ? "ok" : "none"}
      used={used}
      busy={false}
      onChop={() => {}}
      onTake={() => {}}
      onClose={() => {}}
    />,
  );

describe("DecorChopDialog", () => {
  beforeEach(() => {
    ui.lang = "ru";
  });

  it("инструмент есть — «Срубить (−1 Пила)», кнопка активна", () => {
    const out = html(true);
    expect(out).toContain("Срубить (−1 Пила)");
    expect(out).toContain("+1-3 Дерево");
    expect(out).not.toContain(`disabled=""`);
    // Без надписи заголовок — как раньше, имя декора.
    expect(out).toMatch(/<h3[^>]*>Сосна<\/h3>/);
  });

  it("надпись шаблона — в кнопке и заголовке, у износа — «<Надпись> (−25% прочности)»", () => {
    const label = { ru: "Спилить", en: "Saw down" };
    const out = html(true, { label });
    expect(out).toContain("Спилить (−1 Пила)");
    expect(out).toMatch(/<h3[^>]*>Спилить · Сосна<\/h3>/);
    expect(out).not.toContain("Срубить");
    expect(html(true, { label, toolWear: 25 })).toContain("Спилить (−25% прочности)");
  });

  it("английский: своя надпись, нет en — ru, нет вовсе — «Chop»", () => {
    ui.lang = "en";
    expect(html(true, { label: { ru: "Спилить", en: "Saw down" } })).toContain(
      "Saw down (−1 Пила)",
    );
    expect(html(true, { label: { ru: "Спилить" } })).toContain("Спилить (−1 Пила)");
    expect(html(true)).toContain("Chop (−1 Пила)");
  });

  it("инструмента нет — кнопка неактивна «Требуется Пила»", () => {
    const out = html(false);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Требуется Пила/);
  });

  it("инструмент есть, но в руках другое — активная «Взять Пила»", () => {
    const out = html("idle");
    expect(out).toContain("Взять Пила");
    expect(out).not.toContain(`disabled=""`);
    expect(out).not.toContain("Срубить (");
  });

  const SAW: View = { id: "cst_saw", name: "Пила", image: null, wear: null, key: "custom:cst_saw" };
  const AXE: View = { id: "cst_axe", name: "Топор", image: null, wear: 25, key: "custom:cst_axe" };

  it("несколько инструментов: рубит второй — его имя и износ; «Взять» — его", () => {
    const tools = [SAW, AXE];
    expect(html(true, { tools }, AXE)).toContain("Срубить (−25% прочности)");
    expect(html(true, { tools }, AXE)).toContain(">Топор<");
    expect(html("idle", { tools }, AXE)).toContain("Взять Топор");
  });

  it("нечем рубить — все допустимые через «или» / «or», картинки первого нет", () => {
    const tools = [{ ...SAW, image: "saw.png" }, AXE];
    const out = html(false, { tools });
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Требуется Пила или Топор/);
    expect(out).not.toContain("saw.png");
    expect(html(true, { tools }, tools[0])).toContain("saw.png");
    ui.lang = "en";
    expect(html(false, { tools })).toContain("Need Пила or Топор");
  });

  it("рубка руками (§8.56) — только когда нечем рубить, под основной кнопкой", () => {
    const withHand = (tool: "ok" | "idle" | "none") =>
      renderToStaticMarkup(
        <DecorChopDialog
          conf={{ ...conf, hand: true }}
          tool={tool}
          busy={false}
          onChop={() => {}}
          onTake={() => {}}
          onClose={() => {}}
          hand={<i>hand-chop</i>}
        />,
      );
    expect(withHand("none")).toMatch(/Требуется Пила[^]*<i>hand-chop<\/i>/);
    expect(withHand("ok")).not.toContain("hand-chop");
    expect(withHand("idle")).not.toContain("hand-chop");
  });

  it("ru и en заведены для всех ключей окна", () => {
    for (const k of [
      "braid.decor_chop",
      "braid.decor_chop_cost",
      "braid.decor_need_tool",
      "braid.decor_tool_or",
      "tool.take",
    ]) {
      expect(dict[k]?.ru).toBeTruthy();
      expect(dict[k]?.en).toBeTruthy();
    }
  });
});
