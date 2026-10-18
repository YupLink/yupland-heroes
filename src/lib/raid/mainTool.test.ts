// Основной инструмент — правило (§8.24): что сейчас в руках, чем действовать и
// что показать. Один в руках; сломалась штука — следующая той же стопки;
// кончилась лопата — другая лопата героя; кончилось всё — основного нет;
// основного нет, а подходящая одна — она (выбор при однозначности).
import { describe, expect, it } from "vitest";
import {
  effectiveMain,
  familyOf,
  pickMain,
  shovelsOf,
  shownDurability,
  type ToolStack,
} from "@/lib/raid/mainTool";

const AXE = "custom:cst_axe";
const PICK = "custom:cst_pick";
const SH1 = "custom:cst_sh1";
const SH2 = "custom:cst_sh2";
const axe = (count = 1): ToolStack => ({ stackKey: AXE, count, durability: 66 });
const pickaxe = (count = 1): ToolStack => ({ stackKey: PICK, count });
const shovel = (key: string, count = 1, durability: number | null = 100): ToolStack => ({
  stackKey: key,
  count,
  shovel: true,
  durability,
});

describe("что в руках (effectiveMain)", () => {
  it("выбранная стопка с целой штукой — она; не выбрано — никого", () => {
    expect(effectiveMain({ key: AXE, shovel: false }, [axe(2)])).toBe(AXE);
    expect(effectiveMain({ key: null, shovel: false }, [axe(2)])).toBeNull();
  });

  it("сломался последний топор — основного нет (другой стопки топора не бывает)", () => {
    expect(effectiveMain({ key: AXE, shovel: false }, [axe(0), shovel(SH1)])).toBeNull();
    expect(effectiveMain({ key: AXE, shovel: false }, [])).toBeNull();
  });

  it("кончилась лопата в руках — её место занимает другая лопата, начатая первой", () => {
    const stacks = [shovel(SH1, 0), shovel(SH2, 1, 100), shovel("custom:cst_sh3", 2, 50)];
    expect(effectiveMain({ key: SH1, shovel: true }, stacks)).toBe("custom:cst_sh3");
    expect(effectiveMain({ key: SH1, shovel: true }, [shovel(SH1, 0), axe()])).toBeNull();
  });

  it("дробный остаток — не штука: в руках его нет", () => {
    expect(effectiveMain({ key: AXE, shovel: false }, [axe(0.5)])).toBeNull();
  });
});

describe("чем действовать (pickMain)", () => {
  it("рубка — только основным нужным; другой в руках — «Взять», нет — «Нужен»", () => {
    const stacks = [axe(), pickaxe(), shovel(SH1)];
    expect(pickMain(AXE, stacks, { kind: "item", key: AXE })).toEqual({ ok: true, key: AXE });
    expect(pickMain(PICK, stacks, { kind: "item", key: AXE })).toEqual({
      ok: false,
      why: "idle",
      key: AXE,
    });
    expect(pickMain(SH1, stacks, { kind: "item", key: AXE }).ok).toBe(false);
    expect(pickMain(AXE, [pickaxe()], { kind: "item", key: AXE })).toEqual({
      ok: false,
      why: "none",
    });
  });

  it("основного нет — единственная подходящая стопка им и становится", () => {
    const stacks = [axe(), pickaxe(), shovel(SH1)];
    expect(pickMain(null, stacks, { kind: "item", key: PICK })).toEqual({ ok: true, key: PICK });
    expect(pickMain(null, stacks, { kind: "shovel" })).toEqual({ ok: true, key: SH1 });
  });

  it("лопат несколько, основного нет — выбрать самому (предлагаем начатую)", () => {
    const stacks = [shovel(SH1, 1, 100), shovel(SH2, 1, 25)];
    expect(pickMain(null, stacks, { kind: "shovel" })).toEqual({
      ok: false,
      why: "idle",
      key: SH2,
    });
    expect(pickMain(SH1, stacks, { kind: "shovel" })).toEqual({ ok: true, key: SH1 });
  });

  it("лопата: в руках топор — «Взять лопату»; лопаты нет — «Нужна»", () => {
    expect(pickMain(AXE, [axe(), shovel(SH1)], { kind: "shovel" })).toEqual({
      ok: false,
      why: "idle",
      key: SH1,
    });
    expect(pickMain(AXE, [axe()], { kind: "shovel" })).toEqual({ ok: false, why: "none" });
  });

  it("мёртвый ключ в руках — как «не выбран»", () => {
    expect(pickMain(AXE, [axe(0), pickaxe()], { kind: "item", key: PICK })).toEqual({
      ok: true,
      key: PICK,
    });
  });

  it("лопаты по износу: начатая первой, при равной — по ключу", () => {
    const order = shovelsOf([
      shovel(SH2, 1, 100),
      shovel(SH1, 1, 100),
      shovel("custom:cst_a", 1, 40),
    ]);
    expect(order.map((s) => s.stackKey)).toEqual(["custom:cst_a", SH1, SH2]);
    expect(shovelsOf([shovel(SH1, 0), axe()])).toEqual([]);
  });
});

describe("0 % нигде", () => {
  it("живая штука показывает не меньше 1 % и не больше 100 %", () => {
    expect(shownDurability(0.4)).toBe(1);
    expect(shownDurability(0)).toBe(1);
    expect(shownDurability(1)).toBe(1);
    expect(shownDurability(66)).toBe(66);
    expect(shownDurability(100.2)).toBe(100);
    expect(shownDurability(Number.NaN)).toBe(1);
  });
});

describe("удочка — семейство по галочке, как лопата (§8.35)", () => {
  const R1 = "custom:cst_rod1";
  const R2 = "custom:cst_rod2";
  const rod = (key: string, count = 1, durability: number | null = 100): ToolStack => ({
    stackKey: key,
    count,
    rod: true,
    durability,
  });

  it("кончилась удочка в руках — её место занимает другая удочка, начатая первой", () => {
    const stacks = [rod(R1, 0), rod(R2, 1, 100), rod("custom:cst_rod3", 1, 40)];
    expect(effectiveMain({ key: R1, shovel: false, rod: true }, stacks)).toBe("custom:cst_rod3");
    expect(effectiveMain({ key: R1, shovel: false, rod: true }, [rod(R1, 0), axe()])).toBeNull();
    // Лопата удочку не заменяет, и наоборот.
    expect(
      effectiveMain({ key: R1, shovel: false, rod: true }, [rod(R1, 0), shovel(SH1)]),
    ).toBeNull();
    expect(effectiveMain({ key: SH1, shovel: true }, [shovel(SH1, 0), rod(R2)])).toBeNull();
  });

  it("рыбалке — удочка: в руках — она; одна, руки пусты — она; в руках топор — «Взять»", () => {
    expect(pickMain(R1, [rod(R1), axe()], { kind: "rod" })).toEqual({ ok: true, key: R1 });
    expect(pickMain(null, [rod(R1), axe()], { kind: "rod" })).toEqual({ ok: true, key: R1 });
    expect(pickMain(AXE, [rod(R1), axe()], { kind: "rod" })).toEqual({
      ok: false,
      why: "idle",
      key: R1,
    });
    expect(pickMain(null, [rod(R1), rod(R2, 1, 30)], { kind: "rod" })).toEqual({
      ok: false,
      why: "idle",
      key: R2,
    });
    expect(pickMain(null, [axe(), shovel(SH1)], { kind: "rod" })).toEqual({
      ok: false,
      why: "none",
    });
  });

  it("удочка в руках — лопате и топору «Взять»; лопата удочкой не считается", () => {
    expect(pickMain(R1, [rod(R1), shovel(SH1)], { kind: "shovel" }).ok).toBe(false);
    expect(pickMain(R1, [rod(R1), axe()], { kind: "item", key: AXE }).ok).toBe(false);
    expect(familyOf([rod(R1), shovel(SH1)], "rod").map((s) => s.stackKey)).toEqual([R1]);
  });
});
