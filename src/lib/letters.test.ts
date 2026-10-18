// Письма: текст абзацами, список «кому» из строки, проверка формы, «Только мне».
import { describe, expect, it } from "vitest";
import {
  isOnlyMe,
  letterError,
  letterErrText,
  letterInLang,
  letterParagraphs,
  letterUntilError,
  parseAccountList,
} from "./letters";

describe("текст абзацами", () => {
  it("пустая строка — новый абзац, одиночный перенос остаётся внутри", () => {
    expect(letterParagraphs("Первый\nстрока два\n\n\nВторой\r\n\r\nТретий  ")).toEqual([
      "Первый\nстрока два",
      "Второй",
      "Третий",
    ]);
  });

  it("строка из пробелов между абзацами — тоже разрыв; пустой текст — ничего", () => {
    expect(letterParagraphs("А\n   \nБ")).toEqual(["А", "Б"]);
    expect(letterParagraphs("  \n\n ")).toEqual([]);
  });
});

describe("список «кому»", () => {
  it("запятые, точки с запятой, пробелы и переносы; без повторов", () => {
    expect(parseAccountList(" acc_1, 123;bob.near\nacc_1 ,, ")).toEqual([
      "acc_1",
      "123",
      "bob.near",
    ]);
  });
});

describe("проверка письма", () => {
  const ok = { title: "Т", body: "Текст", image: null, audience: "me", accounts: [] };

  it("годное — без ошибки", () => expect(letterError(ok)).toBeNull());

  it("нужны заголовок и текст", () => {
    expect(letterError({ ...ok, title: "  " })).toBe("letter.err.title");
    expect(letterError({ ...ok, body: "\n" })).toBe("letter.err.body");
  });

  it("картинка — только http(s), ipfs:// или /uploads/", () => {
    expect(letterError({ ...ok, image: "https://x.io/a.png" })).toBeNull();
    expect(letterError({ ...ok, image: "ipfs://Qm1" })).toBeNull();
    expect(letterError({ ...ok, image: "/uploads/a.png" })).toBeNull();
    expect(letterError({ ...ok, image: "javascript:alert(1)" })).toBe("letter.err.image");
    expect(letterError({ ...ok, image: "//evil.io/a.png" })).toBe("letter.err.image");
  });

  it("список без аккаунтов — ошибка; кому неизвестно — ошибка", () => {
    expect(letterError({ ...ok, audience: "list" })).toBe("letter.err.accounts");
    expect(letterError({ ...ok, audience: "list", accounts: ["acc_1"] })).toBeNull();
    expect(letterError({ ...ok, audience: "some" })).toBe("letter.err.audience");
  });
});

describe("английская версия", () => {
  const ok = { title: "Т", body: "Текст", audience: "all", accounts: [] };
  const l = { title: "Турнир", body: "Текст", titleEn: "Tournament", bodyEn: "Text" };

  it("en-интерфейс — английская, ru — русская", () => {
    expect(letterInLang(l, "en")).toEqual({ title: "Tournament", body: "Text" });
    expect(letterInLang(l, "ru")).toEqual({ title: "Турнир", body: "Текст" });
  });

  it("перевода нет или он неполный — русская целиком", () => {
    expect(letterInLang({ ...l, bodyEn: " " }, "en").title).toBe("Турнир");
    expect(letterInLang({ ...l, titleEn: null, bodyEn: null }, "en").body).toBe("Текст");
  });

  it("длины как у русской; половина перевода — ошибка; без перевода — можно", () => {
    expect(letterError({ ...ok, titleEn: "x".repeat(121), bodyEn: "B" })).toBe(
      "letter.err.title_en_long",
    );
    expect(letterError({ ...ok, titleEn: "T", bodyEn: "x".repeat(4001) })).toBe(
      "letter.err.body_en_long",
    );
    expect(letterError({ ...ok, titleEn: "T", bodyEn: "  " })).toBe("letter.err.en_half");
    expect(letterError({ ...ok, titleEn: null, bodyEn: "B" })).toBe("letter.err.en_half");
    expect(letterError({ ...ok, titleEn: "T", bodyEn: "B" })).toBeNull();
    expect(letterError({ ...ok, titleEn: "", bodyEn: null })).toBeNull();
  });
});

describe("«показывать до»", () => {
  const NOW = Date.parse("2026-10-05T12:00:00Z");

  it("пусто — бессрочно; ISO с поясом — годится; без пояса и мусор — нет", () => {
    expect(letterUntilError(null)).toBeNull();
    expect(letterUntilError("2026-10-11T23:59:00.000Z")).toBeNull();
    expect(letterUntilError("2026-10-11T23:59:00+03:00")).toBeNull();
    expect(letterUntilError("2026-10-11T23:59")).toBe("letter.err.until");
    expect(letterUntilError("завтра")).toBe("letter.err.until");
  });

  it("прошлое — только прежнее (с точностью до минуты)", () => {
    const past = "2026-10-01T10:00:00.000Z";
    const opts = { nowMs: NOW };
    expect(letterUntilError(past, opts)).toBe("letter.err.until_past");
    expect(letterUntilError(past, { ...opts, keepUntil: "2026-10-01T10:00:42.500Z" })).toBeNull();
    expect(letterUntilError(past, { ...opts, keepUntil: "2026-10-01T10:01:00.000Z" })).toBe(
      "letter.err.until_past",
    );
    expect(letterUntilError("2026-10-06T00:00:00.000Z", opts)).toBeNull();
  });

  it("проверка письма зовёт её последней", () => {
    const d = { title: "Т", body: "Т", audience: "all", accounts: [], showUntil: "x" };
    expect(letterError(d)).toBe("letter.err.until");
  });
});

describe("«Только мне» и текст ошибки", () => {
  it("список ровно из моего аккаунта", () => {
    expect(isOnlyMe({ audience: "list", accounts: ["acc_me"] }, "acc_me")).toBe(true);
    expect(isOnlyMe({ audience: "list", accounts: ["acc_me", "acc_x"] }, "acc_me")).toBe(false);
    expect(isOnlyMe({ audience: "all", accounts: [] }, "acc_me")).toBe(false);
  });

  it("ключ — переводом, хвост после двоеточия — как есть", () => {
    const t = (k: string) => ({ "letter.err.unknown": "Не нашли аккаунты" })[k] ?? k;
    expect(letterErrText(new Error("letter.err.unknown:zzz, yyy"), t)).toBe(
      "Не нашли аккаунты: zzz, yyy",
    );
  });
});
