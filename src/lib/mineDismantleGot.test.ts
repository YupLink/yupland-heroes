// Тост разборки шахты: «Получено: +90 дерева, …» вместо «мешочек на клетке»;
// алмазы склоняются, дроби — до 0,0001; мешочек товаров — отдельной фразой.
import { describe, expect, it } from "vitest";
import { tFor } from "@/lib/i18n";
import { dismantleGotText, dismantleToastText } from "@/lib/mineDismantleGot";

const ru = (k: string, p?: Record<string, string | number>) => tFor("ru", k, p);
const en = (k: string, p?: Record<string, string | number>) => tFor("en", k, p);

describe("dismantleGotText", () => {
  it("ru: сыпучие — родительный, алмазы — по числу; порядок дерево → алмазы", () => {
    expect(dismantleGotText({ gold: 45, wood: 90, stone: 15 }, "ru")).toBe(
      "+90 дерева, +15 камня, +45 золота",
    );
    expect(dismantleGotText({ diamonds: 1 }, "ru")).toBe("+1 алмаз");
    expect(dismantleGotText({ diamonds: 4 }, "ru")).toBe("+4 алмаза");
    expect(dismantleGotText({ diamonds: 5 }, "ru")).toBe("+5 алмазов");
    expect(dismantleGotText({ diamonds: 0.6 }, "ru")).toBe("+0,6 алмаза");
  });

  it("en и дроби до 0,0001; нули и пусто — ничего", () => {
    expect(dismantleGotText({ wood: 0.0003, diamonds: 4.5 }, "en")).toBe(
      "+0.0003 wood, +4.5 diamonds",
    );
    expect(dismantleGotText({ diamonds: 1 }, "en")).toBe("+1 diamond");
    expect(dismantleGotText({ wood: 0 }, "ru")).toBe("");
    expect(dismantleGotText({}, "en")).toBe("");
  });
});

describe("dismantleToastText", () => {
  it("ресурсы на счёте — «Получено: …», без слова о мешочке", () => {
    expect(dismantleToastText(ru, "ru", { bag: null, got: { wood: 90 } })).toBe(
      "Шахта разобрана. Получено: +90 дерева",
    );
    expect(dismantleToastText(en, "en", { bag: null, got: { gold: 45 } })).toBe(
      "Mine dismantled. Received: +45 gold",
    );
  });

  it("есть товары — и про мешочек; ничего — просто «разобрана»", () => {
    expect(dismantleToastText(ru, "ru", { bag: "lb_1", got: { stone: 15 } })).toBe(
      "Шахта разобрана. Получено: +15 камня. Товары — мешочком на её месте",
    );
    expect(dismantleToastText(ru, "ru", { bag: "lb_1", got: {} })).toBe(
      "Шахта разобрана — мешочек на её месте",
    );
    expect(dismantleToastText(en, "en", { bag: null, got: {} })).toBe("Mine dismantled");
  });
});
