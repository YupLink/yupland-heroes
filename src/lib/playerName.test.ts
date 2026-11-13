// Имя игрока: 3–20 знаков, буквы/цифры/пробел/_-., хотя бы одна буква.
import { describe, expect, it } from "vitest";
import { nameProblem, normalizeName } from "./playerName";

describe("имя игрока", () => {
  it("пробелы по краям и двойные убираются", () => {
    expect(normalizeName("  Сэр   Копатель ")).toBe("Сэр Копатель");
  });
  it("годится: кириллица или латиница, цифры, _-.", () => {
    for (const n of ["Миша", "Player_One", "Дракон-77", "a.b c"]) expect(nameProblem(n)).toBeNull();
  });
  it("пустое — снять имя, это можно", () => expect(nameProblem("")).toBeNull());
  it("коротко, длинно, чужие знаки, без букв — отказ", () => {
    expect(nameProblem("ab")).toBe("pname.short");
    expect(nameProblem("x".repeat(21))).toBe("pname.long");
    expect(nameProblem("<script>")).toBe("pname.chars");
    expect(nameProblem("@ownernick")).toBe("pname.chars");
    expect(nameProblem("12345")).toBe("pname.letter");
  });
  it("невидимые буквы, смесь латиницы с кириллицей, вид служебной подписи — отказ", () => {
    expect(nameProblem("\u3164\u3164\u3164")).toBe("pname.chars");
    expect(nameProblem("ownernick\u3164")).toBe("pname.chars");
    expect(nameProblem("Мisha")).toBe("pname.mixed");
    expect(nameProblem("id123456")).toBe("pname.reserved");
    expect(nameProblem("bob.near")).toBe("pname.reserved");
    expect(nameProblem("player1.tg")).toBe("pname.reserved");
  });
});
