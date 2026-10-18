// Отказ сервера — на языке игрока. Отдельно проверяем ключ С ЧИСЛАМИ:
// «market.backpack_need:1:0» в словаре не лежит (там ключ без хвоста), и
// наивный t(msg) отдавал его игроку как есть — в тосте маркета 10.09 было
// видно ровно это.
import { describe, it, expect, afterEach } from "vitest";
import { serverErrorText } from "./serverErrorText";
import { tFor } from "./i18n";
import { useAppStore, type Lang } from "./store";

const tRu = (key: string): string => tFor("ru", key);
const tEn = (key: string): string => tFor("en", key);
const setLang = (lang: Lang) => useAppStore.setState({ lang });

afterEach(() => setLang("ru"));

describe("ключ с числами", () => {
  it("превращается во фразу с числами, а не в сам ключ", () => {
    const text = serverErrorText(new Error("market.backpack_need:2:1"), tRu);
    expect(text).not.toContain("market.backpack_need");
    expect(text).toContain("2");
    expect(text).toContain("1");
  });

  it("говорит по-английски, когда интерфейс английский", () => {
    // Язык числового ключа берётся из стора (humanError зовут вне рендера).
    setLang("en");
    expect(serverErrorText(new Error("market.backpack_need:2:1"), tEn)).toContain(
      "Free up backpack space",
    );
  });
});

describe("обычный ключ", () => {
  it("переводится словарём", () => {
    expect(serverErrorText(new Error("market.need_hero"), tRu)).toBe(tRu("market.need_hero"));
  });

  it("незнакомая фраза доезжает как есть", () => {
    expect(serverErrorText(new Error("что-то своё"), tRu)).toBe("что-то своё");
  });
});
