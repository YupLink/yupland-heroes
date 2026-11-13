// Изменяемое в каждом ударе — из ответа удара: HP в карточке цели, энергия в
// шапке и состоянии рейда. Неизменное в карточке не трогаем и не перезапрашиваем.
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { encounterKey, patchEncounterCard, spendEnergyLocally } from "./fightCachePatch";
import { guardRefreshKeys, refreshAfterGuardHit } from "../mine/guardRefresh";

const target = { objectId: "boss_1", q: 3, r: 4 };

describe("patchEncounterCard", () => {
  it("меняет только HP и «добит», шаблон и способности остаются тем же объектом", () => {
    const qc = new QueryClient();
    const abilities = [{ kind: "burn" }];
    qc.setQueryData(encounterKey(target), {
      name: "Гончая",
      imageUrl: "x.png",
      abilities,
      currentHp: 900,
      maxHp: 1000,
      killed: false,
    });
    patchEncounterCard(qc, target, { hpAfter: 640, maxHp: 1000, killed: false });
    const card = qc.getQueryData<{
      name: string;
      abilities: unknown;
      currentHp: number;
      killed: boolean;
    }>(encounterKey(target));
    expect(card?.currentHp).toBe(640);
    expect(card?.name).toBe("Гончая");
    expect(card?.abilities).toBe(abilities);
    expect(qc.getQueryState(encounterKey(target))?.isInvalidated).toBe(false);
  });
  it("закрытой карточки нет — не создаёт пустую", () => {
    const qc = new QueryClient();
    patchEncounterCard(qc, target, { hpAfter: 1, maxHp: 2, killed: false });
    expect(qc.getQueryData(encounterKey(target))).toBeUndefined();
  });
});

describe("spendEnergyLocally", () => {
  it("списывает цену удара в шапке и состоянии, метку свежести не двигает", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ENERGY_KEY,
      { energy: 95, maxEnergy: 206, nextRegenSec: 40 },
      { updatedAt: 1000 },
    );
    qc.setQueryData(
      ["beta-raid-state"],
      { energy: 95, maxEnergy: 206, position: null, mapId: "m" },
      { updatedAt: 2000 },
    );
    spendEnergyLocally(qc, 10);
    expect(qc.getQueryData<{ energy: number }>(ENERGY_KEY)?.energy).toBe(85);
    expect(qc.getQueryData<{ energy: number }>(["beta-raid-state"])?.energy).toBe(85);
    expect(qc.getQueryState(ENERGY_KEY)?.dataUpdatedAt).toBe(1000);
    expect(qc.getQueryState(["beta-raid-state"])?.dataUpdatedAt).toBe(2000);
    spendEnergyLocally(qc, 500);
    expect(qc.getQueryData<{ energy: number }>(ENERGY_KEY)?.energy).toBe(0);
    spendEnergyLocally(qc, undefined);
    expect(qc.getQueryData<{ energy: number }>(ENERGY_KEY)?.energy).toBe(0);
  });
});

describe("удар по охране шахты/сундука", () => {
  const flat = (k: unknown[][]) => k.map((x) => x[0]);
  it("простой удар: только окно клетки (HP охранника)", () => {
    const k = guardRefreshKeys({ killed: false, spentEnergy: 15 }, 1, 2);
    expect(k.active).toEqual([["beta-raid-building", 1, 2]]);
    expect(k.all).toEqual([]);
  });
  it("охрана пала: слой охраны и флаги; оглушение — инвентарь фишек", () => {
    const k = guardRefreshKeys({ killed: true, chipEffects: [{ kind: "stun" }] }, 1, 2);
    expect(flat(k.all)).toEqual([
      "beta-raid-mine-guards",
      "beta-raid-mine-flags",
      "beta-raid-state",
    ]);
    expect(flat(k.active)).toContain("my-chip-inventory");
  });
  it("энергию списывает из ответа, инвентарь фишек не трогает без оглушения", () => {
    const qc = new QueryClient();
    qc.setQueryData(ENERGY_KEY, { energy: 50, maxEnergy: 206, nextRegenSec: 0 });
    qc.setQueryData(["my-chip-inventory"], [{ id: "c" }]);
    refreshAfterGuardHit(qc, { killed: false, spentEnergy: 15 }, 1, 2);
    expect(qc.getQueryData<{ energy: number }>(ENERGY_KEY)?.energy).toBe(35);
    expect(qc.getQueryState(["my-chip-inventory"])?.isInvalidated).toBe(false);
  });
});
