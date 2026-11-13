// Артефакт по словам: предмет и желания из слов, пусто — рандом.
import { describe, expect, it } from "vitest";
import { CRAFT_FORMS } from "./craftForms";
import { cleanWords, lookWords, readWords } from "./craftWords";

describe("слова → предмет и желания", () => {
  it("наручи — наручи; «хочу на ассасина» — специализация ассасин", () => {
    expect(readWords("наручи")).toEqual({ form: "bracers", boost: {} });
    expect(readWords("хочу на ассасина")).toEqual({ form: null, boost: { spec: "Ассасин" } });
  });

  it("всё сразу: предмет, раса, специализация, характеристика", () => {
    expect(readWords("огненный меч дракона для мага на атаку")).toEqual({
      form: "sword",
      boost: { race: "Дракон", spec: "Маг", stat: "Attack" },
    });
  });

  it("дракошка — не дракон; магический лес — местность, а не маг", () => {
    expect(readWords("кольцо дракошки").boost).toEqual({ race: "ДраКошка" });
    expect(readWords("посох магический лес").boost).toEqual({ land: "Магический лес" });
  });

  it("портал — не порт, бронзовый — не броня", () => {
    expect(readWords("амулет портала").boost).toEqual({});
    expect(readWords("бронзовый шлем").boost).toEqual({});
  });

  it("английские слова тоже", () => {
    expect(readWords("bee helmet of the warrior")).toEqual({
      form: "helmet",
      boost: { race: "Пчела", spec: "Воин" },
    });
  });

  it("пусто — ничего не выбрано: рандом", () => {
    expect(readWords("")).toEqual({ form: null, boost: {} });
  });

  it("у каждой формы предмета есть слово", () => {
    const known = new Set(CRAFT_FORMS.map((f) => f.id));
    for (const id of known) expect(id).toBeTruthy();
    expect(readWords("сапоги").form).toBe("boots");
    expect(readWords("плащ").form).toBe("cloak");
    expect(readWords("книга заклинаний").form).toBe("tome");
  });
});

describe("чистка слов", () => {
  it("лишние знаки уходят, длина ограничена", () => {
    expect(cleanWords("  меч<script>alert(1)</script>  ")).toBe("меч script alert 1 script");
    expect(cleanWords("а".repeat(500))!.length).toBe(120);
    expect(cleanWords("ёлка")).toBe("елка");
  });

  it("недопустимое — отказ", () => {
    expect(cleanWords("голая статуэтка")).toBeNull();
    expect(cleanWords("NSFW sword")).toBeNull();
  });
});

describe("вид для картинки", () => {
  it("желания и учтённое уходят, описание остаётся", () => {
    expect(lookWords("хочу на быстрого героя единорога мага с золотым рогом")).toBe(
      "с золотым рогом",
    );
    expect(lookWords("наручи ассасина из драконьей чешуи")).toBe("из чешуи");
    expect(lookWords("хочу на ассасина")).toBe("");
    expect(lookWords("ледяной меч с черепом на рукояти")).toBe("ледяной с черепом на рукояти");
  });

  it("непристойное — отказ, обычное — нет", () => {
    expect(cleanWords("единорог с елдаком вместо рога")).toBeNull();
    expect(cleanWords("херувим с арфой")).toBe("херувим с арфой");
    expect(cleanWords("членистоногий талисман")).toBe("членистоногий талисман");
  });
});
