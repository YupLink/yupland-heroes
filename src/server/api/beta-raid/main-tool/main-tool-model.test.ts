// Гард удара не строже правила (§8.24): всё, чем правило (pickMain∘effectiveMain,
// им же живут кнопки и выбор стопки на сервере) велит действовать, гард в SQL
// пропускает — иначе игрок застрял бы: кнопка есть, удар — «возьми в руки».
// Гард — модель фейка mainOkModel (с SQL сверена на Postgres); перебор всех
// сочетаний: что записано, штуки топора, кирки и двух лопат, что нужно делу,
// и инструмент декора — лопата (админ может так задать).
import { describe, expect, it } from "vitest";
import { effectiveMain, pickMain, type ToolNeed } from "@/lib/raid/mainTool";
import { fx, isShovel, mainOkModel, packOf, resetFx } from "./main-tool.fake";

const KEYS = ["custom:cst_axe", "custom:cst_pick", "custom:cst_sh1", "custom:cst_sh2"];

describe("гард удара и правило", () => {
  it("правило велит бить стопкой — гард её пропускает (ни одного «застрял»)", () => {
    let checked = 0;
    for (const stored of [null, ...KEYS, "custom:cst_gone"])
      for (let mask = 0; mask < 16; mask++)
        for (const need of [{ kind: "shovel" }, ...KEYS.map((key) => ({ kind: "item", key }))]) {
          resetFx();
          fx.catalog.set("cst_sh1", { name: "s1", shovel: true });
          fx.catalog.set("cst_sh2", { name: "s2", shovel: true, wear: 25 });
          fx.main.set("h1", stored);
          KEYS.forEach((k, i) => packOf("h1").set(k, { count: (mask >> i) & 1, wear: 0 }));
          const stacks = KEYS.map((k, i) => ({
            stackKey: k,
            count: (mask >> i) & 1,
            shovel: isShovel(k),
            durability: 100,
          }));
          const main = effectiveMain({ key: stored, shovel: isShovel(stored) }, stacks);
          const pick = pickMain(main, stacks, need as ToolNeed);
          if (!pick.ok) continue;
          checked++;
          expect(mainOkModel("h1", pick.key, need.kind === "shovel" ? "shovel" : "item")).toBe(
            true,
          );
        }
    expect(checked).toBeGreaterThan(100);
  });
});
