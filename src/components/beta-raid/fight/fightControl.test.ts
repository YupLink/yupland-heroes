// Бой на карте (владелец, 22–23.10.2026): первое нажатие по цели рядом — выбор
// («i» и «Атаковать»), второе и дальше — удар; «Атаковать» — удар сразу; нельзя
// ударить — окно цели; «Атаковать снова» — та же цель тем же отрядом.
import { describe, expect, it, vi } from "vitest";
import type { LineChip } from "@/components/game/ChipSquadPicker";
import type { Cell } from "@/components/beta-raid/unpackMap";
import {
  createFightControl,
  fightTargetNear,
  hitCost,
  metaCost,
  quickBlock,
  refusalOpensInfo,
  type FightArgs,
  type FightDeps,
  type FightTarget,
} from "./fightControl";
import { attackFight, openFightInfo, publishFightInfo, setFightAttacker, setFightInfoOpener } from "./fightInfoBus";

const chip = (templateId: string): LineChip => ({ templateId, level: 3, image: "", name: "" });
const BOSS: FightTarget = { objectId: "boss:wolf", q: 1, r: 0 };

function setup(over: Partial<FightDeps> & { squad?: LineChip[] } = {}) {
  const hits: Array<{ args: FightArgs; refuse: () => void }> = [];
  const openInfo = vi.fn();
  let squad = over.squad ?? [chip("a"), chip("b")];
  const ctl = createFightControl({
    pending: () => false,
    energy: () => 100,
    lineup: () => squad,
    costOf: () => 10,
    hit: (args, refuse) => hits.push({ args, refuse }),
    openInfo,
    ...over,
  });
  return { ctl, hits, openInfo, setSquad: (s: LineChip[]) => (squad = s) };
}

describe("«Атаковать» по цели рядом", () => {
  it("сразу бьёт запомненным отрядом, окно не открывает", () => {
    const { ctl, hits, openInfo } = setup();
    ctl.attack(BOSS);
    expect(hits).toHaveLength(1);
    expect(hits[0].args).toEqual({ ...BOSS, lineup: [chip("a"), chip("b")] });
    expect(openInfo).not.toHaveBeenCalled();
  });

  it("нет отряда — окно цели вместо удара", () => {
    const { ctl, hits, openInfo } = setup({ squad: [] });
    ctl.attack(BOSS);
    expect(hits).toHaveLength(0);
    expect(openInfo).toHaveBeenCalledWith(expect.objectContaining(BOSS));
  });

  it("не хватает энергии — окно цели; цена неизвестна — решает сервер", () => {
    const low = setup({ energy: () => 9.5 });
    low.ctl.attack(BOSS);
    expect(low.hits).toHaveLength(0);
    expect(low.openInfo).toHaveBeenCalledTimes(1);

    const unknown = setup({ energy: () => 0, costOf: () => null });
    unknown.ctl.attack(BOSS);
    expect(unknown.hits).toHaveLength(1);
  });

  it("сервер отказал по энергии/отряду — окно цели", () => {
    const { ctl, hits, openInfo } = setup();
    ctl.attack(BOSS);
    hits[0].refuse();
    expect(openInfo).toHaveBeenCalledWith(expect.objectContaining(BOSS));
  });

  it("удар уже летит — второй тап ничего не шлёт (нагрузка не растёт)", () => {
    const { ctl, hits, openInfo } = setup({ pending: () => true });
    ctl.attack(BOSS);
    ctl.again({ killed: false });
    expect(hits).toHaveLength(0);
    expect(openInfo).not.toHaveBeenCalled();
  });
});

describe("нажатия по самой цели (владелец, 23.10.2026)", () => {
  const BEAR: FightTarget = { objectId: "boss:bear", q: -1, r: 0 };

  it("первое — только выбор, «i» и «Атаковать» появляются; второе и дальше — удар", () => {
    const onArm = vi.fn();
    const { ctl, hits, openInfo } = setup({ onArm });
    ctl.tap(BOSS);
    expect(hits).toHaveLength(0);
    expect(openInfo).not.toHaveBeenCalled();
    expect(ctl.armed()).toEqual(BOSS);
    expect(onArm).toHaveBeenCalledTimes(1);
    ctl.tap(BOSS);
    ctl.tap(BOSS);
    expect(hits).toHaveLength(2);
  });

  it("другая цель — снова только выбор; выбор снят — снова только выбор", () => {
    const { ctl, hits } = setup();
    ctl.tap(BOSS);
    ctl.tap(BEAR);
    expect(hits).toHaveLength(0);
    expect(ctl.armed()).toEqual(BEAR);
    ctl.disarm();
    expect(ctl.armed()).toBeNull();
    ctl.tap(BEAR);
    expect(hits).toHaveLength(0);
  });

  it("«Атаковать» бьёт сразу и выбирает цель — следующее нажатие по ней тоже бьёт", () => {
    const { ctl, hits } = setup();
    ctl.attack(BOSS);
    expect(hits).toHaveLength(1);
    ctl.tap(BOSS);
    expect(hits).toHaveLength(2);
  });
});

describe("«Атаковать снова» из итога", () => {
  it("та же цель тем же отрядом, даже если запомненный сменился", () => {
    const { ctl, hits, setSquad } = setup();
    ctl.attack(BOSS);
    setSquad([chip("z")]);
    ctl.again({ killed: false, spentEnergy: 10, burnedEnergy: 0 });
    expect(hits).toHaveLength(2);
    expect(hits[1].args).toEqual(hits[0].args);
  });

  it("цель добита или удара не было — ничего", () => {
    const { ctl, hits } = setup();
    ctl.again({ killed: false });
    expect(hits).toHaveLength(0);
    ctl.attack(BOSS);
    ctl.again({ killed: true });
    expect(hits).toHaveLength(1);
  });

  it("энергии меньше цены прошлого удара — окно цели", () => {
    let energy = 100;
    const { ctl, hits, openInfo } = setup({ energy: () => energy });
    ctl.attack(BOSS);
    energy = 12;
    ctl.again({ killed: false, spentEnergy: 15, burnedEnergy: 0 });
    expect(hits).toHaveLength(1);
    expect(openInfo).toHaveBeenCalledWith(expect.objectContaining(BOSS));
  });

  it("удар из окна запоминается — повтор бьёт отрядом окна", () => {
    const { ctl, hits } = setup();
    ctl.fromWindow(BOSS, [chip("w")]);
    ctl.again({ killed: false });
    expect(hits.map((h) => h.args.lineup[0].templateId)).toEqual(["w", "w"]);
    expect(ctl.last()).toEqual({ ...BOSS, lineup: [chip("w")] });
  });
});

describe("правила и цены", () => {
  it("quickBlock: отряд, потом энергия", () => {
    expect(quickBlock(0, 100, 10)).toBe("squad");
    expect(quickBlock(2, 5, 10)).toBe("energy");
    expect(quickBlock(2, 10, 10)).toBeNull();
    expect(quickBlock(2, 0, null)).toBeNull();
  });

  it("окно открывают отказы энергии и отряда, прочее — только тост", () => {
    expect(refusalOpensInfo("Нужно 10 энергии")).toBe(true);
    expect(refusalOpensInfo("Нужно 0.5 энергии")).toBe(true);
    expect(refusalOpensInfo("Нет фишек для боя — открой пак или дождись отдыха фишек")).toBe(true);
    expect(refusalOpensInfo("Подойди ближе к объекту")).toBe(false);
    expect(refusalOpensInfo("Босс уже опустошён")).toBe(false);
    expect(refusalOpensInfo("Слишком часто — подожди пару секунд")).toBe(false);
  });

  it("цена: шаблон или 10, на острове ×0,1; прошлый удар — без выжженного", () => {
    expect(metaCost({}, 1)).toBe(10);
    expect(metaCost({ interactionCost: 25 }, 1)).toBe(25);
    expect(metaCost(null, 0.1)).toBe(1);
    expect(hitCost({ spentEnergy: 13, burnedEnergy: 3 })).toBe(10);
    expect(hitCost({ burnedEnergy: 3 })).toBeNull();
    expect(hitCost(null)).toBeNull();
  });
});

describe("«i» над картой", () => {
  const objects = {
    "boss:wolf": { meta: {}, kind: "boss" },
    "boss:bear": { meta: {}, kind: "boss" },
    "chest:a": { meta: {}, kind: "chest" },
  };
  const at = { q: 0, r: 0 };

  it("цель боя рядом: сундук не в счёт, купол и добитые — тоже", () => {
    const cells: Record<string, Cell> = {
      "1,0": { objectId: "chest:a" },
      "-1,0": { objectId: "boss:bear", objectDefeated: true },
      "0,1": { objectId: "boss:wolf", voidFog: true },
    };
    expect(fightTargetNear(cells, objects, at, null)).toBeNull();
    cells["0,-1"] = { objectId: "boss:wolf" };
    expect(fightTargetNear(cells, objects, at, null)).toEqual({
      objectId: "boss:wolf",
      q: 0,
      r: -1,
    });
  });

  it("два босса рядом — «i» про того, кого бьём", () => {
    const cells: Record<string, Cell> = {
      "1,0": { objectId: "boss:wolf" },
      "-1,0": { objectId: "boss:bear" },
    };
    const bear = { objectId: "boss:bear", q: -1, r: 0 };
    expect(fightTargetNear(cells, objects, at, null)?.objectId).toBe("boss:wolf");
    expect(fightTargetNear(cells, objects, at, bear)).toEqual(bear);
  });

  it("«Атаковать» над картой бьёт выбранную цель; цели нет — ничего", () => {
    const hit = vi.fn();
    setFightAttacker(hit);
    publishFightInfo(null, false);
    attackFight();
    expect(hit).not.toHaveBeenCalled();
    publishFightInfo(BOSS, false);
    attackFight();
    expect(hit).toHaveBeenCalledWith(BOSS);
    setFightAttacker(null);
    publishFightInfo(null, false);
  });

  it("тап по «i» открывает окно цели, что рядом; цели нет — ничего", () => {
    const open = vi.fn();
    setFightInfoOpener(open);
    publishFightInfo(null, false);
    openFightInfo();
    expect(open).not.toHaveBeenCalled();
    publishFightInfo(BOSS, false);
    openFightInfo();
    expect(open).toHaveBeenCalledWith(BOSS);
    setFightInfoOpener(null);
    publishFightInfo(null, false);
  });
});
