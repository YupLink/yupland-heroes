// Письма ждут, пока держит хоть кто-то: остров и окно острова держат порознь,
// повторный захват тем же id снимается парно.
import { describe, expect, it } from "vitest";
import { holdLetters, lettersHeld } from "./letterHold";

describe("letterHold", () => {
  it("никто не держит — письма идут", () => {
    expect(lettersHeld()).toBe(false);
  });

  it("остров и окно держат порознь — письма ждут, пока не отпустят оба", () => {
    holdLetters("island", true);
    holdLetters("island-dialog", true);
    expect(lettersHeld()).toBe(true);
    holdLetters("island", false);
    expect(lettersHeld()).toBe(true);
    holdLetters("island-dialog", false);
    expect(lettersHeld()).toBe(false);
  });

  it("два окна с одним id — держат, пока не закроются оба", () => {
    holdLetters("island-dialog", true);
    holdLetters("island-dialog", true);
    holdLetters("island-dialog", false);
    expect(lettersHeld()).toBe(true);
    holdLetters("island-dialog", false);
    expect(lettersHeld()).toBe(false);
  });
});
