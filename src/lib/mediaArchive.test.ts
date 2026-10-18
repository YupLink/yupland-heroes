// Имена файлов в архиве картинок: как в игре, без запрещённых символов, по
// папкам категорий; одинаковые имена в одной папке не затирают друг друга.
import { describe, expect, it } from "vitest";
import { extOf, makeArchivePaths, safeFileName, type ArchiveItem } from "./mediaArchive";

const item = (cat: ArchiveItem["cat"], name: string, sub: string | null = null): ArchiveItem => ({
  key: `${cat}:${name}`,
  cat,
  sub,
  name,
  url: "/uploads/x.webp",
});

describe("safeFileName", () => {
  it("русское имя — как есть", () => {
    expect(safeFileName("Ратуша")).toBe("Ратуша");
  });
  it("символы, которые не любят Windows и macOS, — на «_»", () => {
    expect(safeFileName("Зелье: «удача» 1/2 *?")).toBe("Зелье_ «удача» 1_2 __");
  });
  it("пустое и точечное имя не ломают файл", () => {
    expect(safeFileName("   ")).toBe("без имени");
    expect(safeFileName("..скрытый")).toBe("скрытый");
  });
});

describe("extOf", () => {
  it("из адреса, jpeg → jpg", () => {
    expect(extOf("/uploads/a/b.WEBP")).toBe("webp");
    expect(extOf("https://x/y.jpeg?v=2")).toBe("jpg");
  });
  it("нет в адресе — по типу ответа, неизвестный — png", () => {
    expect(extOf("/api/img?u=abc", "image/webp; charset=x")).toBe("webp");
    expect(extOf("/noext", null)).toBe("png");
  });
});

describe("makeArchivePaths", () => {
  it("папка категории и подгруппы, номер у повтора имени", () => {
    const paths = makeArchivePaths([
      { item: item("building", "Ратуша"), ext: "webp" },
      { item: item("custom", "Хлеб", "Еда"), ext: "png" },
      { item: item("skin", "Ратуша единорогов", "Ратуши"), ext: "webp" },
      { item: item("skin", "Ратуша единорогов", "Ратуши"), ext: "webp" },
      { item: item("building", "ратуша"), ext: "webp" },
    ]);
    expect(paths).toEqual([
      "Здания/Ратуша.webp",
      "Товары/Еда/Хлеб.png",
      "Облики зданий/Ратуши/Ратуша единорогов.webp",
      "Облики зданий/Ратуши/Ратуша единорогов (2).webp",
      // Регистр не спасает: Windows не различает «Ратуша» и «ратуша».
      "Здания/ратуша (2).webp",
    ]);
  });
});
