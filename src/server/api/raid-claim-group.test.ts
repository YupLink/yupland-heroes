// Фильтр группы: NULL-ссылка, экранирование, вход ручки.
import { describe, it, expect } from "vitest";
import { groupWhereSql, rewardGroupInput } from "./raid-claim-group";

describe("фильтр группы", () => {
  it("без группы — весь список, как раньше", () => {
    expect(groupWhereSql(null)).toBe("");
    expect(groupWhereSql(undefined)).toBe("");
  });

  it("пустая ссылка сравнивается через IS NOT DISTINCT FROM NULL", () => {
    expect(groupWhereSql({ kind: "likes", packId: null })).toBe(
      " AND reward_kind = 'likes' AND pack_id IS NOT DISTINCT FROM NULL",
    );
  });

  it("ссылка и вид уходят строками", () => {
    expect(groupWhereSql({ kind: "custom", packId: "cst_z082it3nhog6" })).toBe(
      " AND reward_kind = 'custom' AND pack_id IS NOT DISTINCT FROM 'cst_z082it3nhog6'",
    );
  });

  it("кавычка в ссылке удваивается", () => {
    expect(groupWhereSql({ kind: "custom", packId: "a'b" })).toContain("'a''b'");
  });
});

describe("вход ручки", () => {
  it("пропускает вид с NULL-ссылкой и символ токена", () => {
    expect(rewardGroupInput.parse({ kind: "likes", packId: null })).toEqual({
      kind: "likes",
      packId: null,
    });
    expect(rewardGroupInput.parse({ kind: "GDarai", packId: null }).kind).toBe("GDarai");
  });

  it("режет мусор в виде и пустую ссылку", () => {
    expect(() => rewardGroupInput.parse({ kind: "likes'; --", packId: null })).toThrow();
    expect(() => rewardGroupInput.parse({ kind: "", packId: null })).toThrow();
    expect(() => rewardGroupInput.parse({ kind: "custom", packId: "" })).toThrow();
    expect(() => rewardGroupInput.parse({ kind: "custom" })).toThrow();
  });
});
