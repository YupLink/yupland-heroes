import { describe, expect, it } from "vitest";
import { parseCellQuery } from "./parseCellQuery";

describe("parseCellQuery", () => {
  it("одна строка в любом ходовом виде", () => {
    for (const s of ["48,-55", "48, -55", " 48 , -55 ", "48 -55", "48;-55", "(48,-55)"]) {
      expect(parseCellQuery(s), s).toEqual({ q: 48, r: -55 });
    }
  });

  it("минус из текста отчёта и мессенджера", () => {
    expect(parseCellQuery("−26,159")).toEqual({ q: -26, r: 159 });
    expect(parseCellQuery("–119, 134")).toEqual({ q: -119, r: 134 });
  });

  it("не координаты — null", () => {
    for (const s of ["", "48", "48,", "a,b", "48,-55,3", "1.5,2", "48--55", "9999999,1"]) {
      expect(parseCellQuery(s), s).toBeNull();
    }
  });
});
