// Карточка «что даёт артефакт»: когда нажатие её закрывает. Таймера нет вовсе —
// карточка висит, пока не нажмут (владелец, 14.10: 3 секунд не хватало прочитать).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { closesOnTap } from "./ArtifactInfoPop";

describe("ArtifactInfoPop — закрытие", () => {
  it("внутри карточки — не закрывает", () => {
    expect(closesOnTap(true, null, "lot1")).toBe(false);
  });
  it("по своему лоту — не закрывает (лот сам переключит вкл/выкл)", () => {
    expect(closesOnTap(false, "lot1", "lot1")).toBe(false);
  });
  it("мимо и по чужому лоту — закрывает", () => {
    expect(closesOnTap(false, null, "lot1")).toBe(true);
    expect(closesOnTap(false, "lot2", "lot1")).toBe(true);
  });
  it("сама не прячется: в карточке нет таймера", () => {
    const src = readFileSync(new URL("./ArtifactInfoPop.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/setTimeout/);
  });
});
