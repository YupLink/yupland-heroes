// Справочник параметров: записи целые на обоих языках, поиск и чипы работают.
import { describe, expect, it } from "vitest";
import { GUIDE_SECTIONS, filterGuide } from "./guideSections";
import type { L } from "./guideTypes";

const filled = (text: L) => text[0].trim().length > 0 && text[1].trim().length > 0;
const all = GUIDE_SECTIONS.flatMap((s) => s.entries);

describe("записи справочника", () => {
  it("у каждой записи есть название и описание на русском и английском", () => {
    for (const e of all) {
      expect(filled(e.name), e.id).toBe(true);
      expect(filled(e.what), e.id).toBe(true);
      if (e.where) expect(filled(e.where), e.id).toBe(true);
    }
  });

  it("id записей и разделов не повторяются — по ним ссылки #p-…", () => {
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = GUIDE_SECTIONS.map((s) => s.id);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it("в таблицах в каждой строке столько ячеек, сколько столбцов", () => {
    for (const e of all) {
      if (!e.table) continue;
      for (const row of e.table.rows) expect(row.length, e.id).toBe(e.table.cols.length);
    }
  });

  it("записи короткие: описание не длиннее 330 знаков", () => {
    for (const e of all) {
      expect(e.what[0].length, e.id).toBeLessThanOrEqual(330);
      expect(e.what[1].length, e.id).toBeLessThanOrEqual(330);
    }
  });

  it("есть всё, о чём просил владелец: раса, атака, боссы, постройки", () => {
    const has = (id: string) => all.some((e) => e.id === id);
    for (const id of [
      "race",
      "class",
      "rarity",
      "atk",
      "arm",
      "luck",
      "boss",
      "dangers",
      "shipyard",
      "town-hall",
      "c-temple",
    ]) {
      expect(has(id), id).toBe(true);
    }
  });
});

describe("filterGuide", () => {
  it("без фильтров — все разделы целиком", () => {
    const out = filterGuide(GUIDE_SECTIONS, [], "", "ru");
    expect(out.map((s) => s.id)).toEqual(GUIDE_SECTIONS.map((s) => s.id));
  });

  it("чипы оставляют только выбранные разделы", () => {
    const out = filterGuide(GUIDE_SECTIONS, ["boss", "castle"], "", "ru");
    expect(out.map((s) => s.id)).toEqual(["boss", "castle"]);
  });

  it("поиск — по названию и тексту на текущем языке, без учёта регистра", () => {
    const ru = filterGuide(GUIDE_SECTIONS, [], "ВЕРФ", "ru").flatMap((s) =>
      s.entries.map((e) => e.id),
    );
    expect(ru).toContain("shipyard");
    const en = filterGuide(GUIDE_SECTIONS, [], "shipyard", "en").flatMap((s) =>
      s.entries.map((e) => e.id),
    );
    expect(en).toContain("shipyard");
    expect(filterGuide(GUIDE_SECTIONS, [], "абракадабра", "ru")).toEqual([]);
  });
});
