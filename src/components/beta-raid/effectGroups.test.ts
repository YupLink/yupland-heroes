// Группы HUD над героем: что показываем, с каким числом и от кого.
import { describe, expect, it } from "vitest";
import { buildEffectGroups } from "./effectGroups";

const now = Date.parse("2026-09-21T00:00:00Z");
const later = (min: number) => new Date(now + min * 60_000).toISOString();

describe("buildEffectGroups", () => {
  it("ослабление и замедление — свои группы с подписью источника", () => {
    const groups = buildEffectGroups({
      chips: [],
      slow: {
        value: 2,
        expiresAt: later(5),
        rows: [{ value: 2, expiresAt: later(5), source: "Лягушка" }],
      },
      weaken: [{ kind: "weak_arm", value: 20, expiresAt: later(30), source: "Гречневое пугало" }],
      buff: [],
      now,
    });
    expect(groups.map((g) => g.key)).toEqual(["slow", "weak_arm"]);
    expect(groups[0]).toMatchObject({ badge: "+2", source: "Лягушка" });
    expect(groups[1]).toMatchObject({ badge: "−20", source: "Гречневое пугало" });
  });

  it("истёкшее не показываем, старый кэш без source не ломает экран", () => {
    const groups = buildEffectGroups({
      chips: [{ chipId: "c1", kind: "poison", name: "Мурзик", level: 3, expiresAt: later(-1) }],
      slow: { value: 3, expiresAt: later(10) },
      weaken: [{ kind: "weak_int", value: 5, expiresAt: later(-5) }],
      buff: undefined,
      now,
    });
    expect(groups).toEqual([
      { key: "slow", badge: "+3", until: later(10), items: [], source: null },
    ]);
  });

  it("фишки одного вида сворачиваются в ×N по последнему сроку", () => {
    const groups = buildEffectGroups({
      chips: [
        { chipId: "c1", kind: "stun", name: "A", level: 1, expiresAt: later(3) },
        { chipId: "c2", kind: "stun", name: "B", level: 2, expiresAt: later(8) },
      ],
      slow: null,
      weaken: [],
      buff: [],
      now,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "stun", badge: "×2", until: later(8) });
    expect(groups[0].items).toHaveLength(2);
  });

  it("замедление: сильнейшее из живых, источник — у сильнейшего", () => {
    const groups = buildEffectGroups({
      chips: [],
      slow: {
        value: 12,
        expiresAt: later(20),
        rows: [
          { value: 12, expiresAt: later(-1), source: "Слизень" },
          { value: 2, expiresAt: later(20), source: "Пиявка" },
        ],
      },
      weaken: [],
      buff: [],
      now,
    });
    expect(groups[0]).toMatchObject({ key: "slow", badge: "+2", source: "Пиявка" });
  });

  it("забвение: заряды — «3 Lv» без таймера, безлимит — таймер (старый ответ сервера)", () => {
    const base = { chips: [], slow: null, weaken: [], buff: [], now };
    expect(buildEffectGroups({ ...base, oblivion: { level: 3, until: null } })).toEqual([
      { key: "oblivion_lv", badge: "3 Lv", until: "", items: [], source: null },
    ]);
    const both = buildEffectGroups({ ...base, oblivion: { level: 1, until: later(30) } });
    expect(both.map((g) => [g.key, g.badge, g.until])).toEqual([
      ["oblivion_time", null, later(30)],
      ["oblivion_lv", "1 Lv", ""],
    ]);
  });

  it("забвение: заряды со сроком — «3 Lv» и таймер; три вида — в порядке траты", () => {
    const base = { chips: [], slow: null, weaken: [], buff: [], now };
    const lvt = { level: 0, until: null, timedLevel: 3, timedUntil: later(20) };
    expect(buildEffectGroups({ ...base, oblivion: lvt })).toEqual([
      { key: "oblivion_lvt", badge: "3 Lv", until: later(20), items: [], source: null },
    ]);
    const all = { level: 5, until: later(10), timedLevel: 2, timedUntil: later(40) };
    expect(
      buildEffectGroups({ ...base, oblivion: all }).map((g) => [g.key, g.badge, g.until]),
    ).toEqual([
      ["oblivion_time", null, later(10)],
      ["oblivion_lvt", "2 Lv", later(40)],
      ["oblivion_lv", "5 Lv", ""],
    ]);
  });

  it("забвение: истёкшее и нулевое — значка нет, мусор из кэша не роняет", () => {
    const base = { chips: [], slow: null, weaken: [], buff: [], now };
    expect(buildEffectGroups({ ...base, oblivion: { level: 0, until: later(-1) } })).toEqual([]);
    const expired = { level: 0, until: null, timedLevel: 4, timedUntil: later(-1) };
    expect(buildEffectGroups({ ...base, oblivion: expired })).toEqual([]);
    expect(buildEffectGroups({ ...base, oblivion: "мусор" })).toEqual([]);
    expect(buildEffectGroups({ ...base })).toEqual([]);
  });
});
