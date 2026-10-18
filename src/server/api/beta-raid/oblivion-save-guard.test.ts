// Сервер не сохраняет «Забвение» с неверной парой «уровень + минуты» (правило
// 28.09) ни в одном из мест записи: товар маркета, заклинание, алтарь и храм
// из режима бога, алтарь и храм из редактора карт. Товар и заклинание
// отказывают ключом словаря (админ читает его тостом на своём языке), карта —
// фразой с координатами клетки: выгрузка идёт пачкой. В базу не уходит ни строки.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((d: unknown) => unknown) | null = null;
    const b = {
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return b;
      },
      handler: (h: (ctx: { data: unknown }) => unknown) => {
        const run = (d: unknown) => (validate ? validate(d) : d);
        const call = async (args: { data?: unknown }) => h({ data: run(args?.data) });
        return Object.assign(call, { validate: run });
      },
    };
    return b;
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [];
  },
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [];
  },
}));
vi.mock("../../auth", () => ({
  getCurrentWallet: () => "admin.near",
  isAdminWallet: () => true,
  requireAdmin: () => "admin.near",
}));
vi.mock("./spell-tpl", () => ({
  SPELL_KINDS: ["boost", "summon_ship", "teleport_town", "create_ship", "repair_ship"],
  loadSpellTemplates: async () => [{ id: "spell_x", name: "Забвение", effects: [] }],
}));

import { createCustomItem, updateCustomItem } from "./market-custom";
import { adminSaveSpell } from "./spell-admin";
import { adminPatchCells } from "./admin-live-batch";
import { adminSaveHexMap } from "../raid-hexmap";

type Fn = ((args: { data?: unknown }) => Promise<unknown>) & { validate: (d: unknown) => unknown };
const fn = (f: unknown) => f as Fn;
const KEY = "oblivion.need_time_or_level";
const CELL = (cell: string) =>
  `Клетка ${cell}, «Забвение»: задай время или количество использований`;

const bad = [
  { stat: "oblivion", value: "0", minutes: "" },
  { stat: "oblivion", value: "", minutes: "" },
  { stat: "oblivion", value: "0-3", minutes: "30" },
  { stat: "oblivion", value: "", minutes: "30" },
];
const good = [
  { stat: "oblivion", value: "1", minutes: "" },
  { stat: "oblivion", value: "2", minutes: "30" },
  { stat: "oblivion", value: "0", minutes: "10-20" },
];

beforeEach(() => {
  s.sql = [];
});

describe("товар маркета (market-custom)", () => {
  const item = (boost: unknown) => ({ name: "Зелье забвения", boost });

  it("создание и правка: неверная пара — отказ ключом, в базу ничего", async () => {
    for (const e of bad) {
      expect(() => fn(createCustomItem).validate(item([e]))).toThrow(KEY);
      await expect(fn(updateCustomItem)({ data: { id: "cst_1", ...item([e]) } })).rejects.toThrow(
        KEY,
      );
    }
    expect(s.sql).toEqual([]);
  });

  it("верная пара сохраняется; буст выключен — правило не мешает", async () => {
    for (const e of good) expect(() => fn(createCustomItem).validate(item([e]))).not.toThrow();
    expect(() => fn(createCustomItem).validate(item(null))).not.toThrow();
    await fn(createCustomItem)({ data: item([{ stat: "oblivion", value: "0", minutes: "30" }]) });
    expect(s.sql[0]).toContain('"stat":"oblivion","value":"0","minutes":"30"');
  });
});

describe("заклинание (spell-admin)", () => {
  const spell = (effects: unknown) => ({
    name: "Забвение",
    effects,
    energyCost: 5,
    cooldownMinutes: 0,
    minInt: 0,
    kind: "boost",
  });

  it("неверная пара — отказ ключом, а не молча выброшенный эффект", async () => {
    for (const e of bad) {
      await expect(fn(adminSaveSpell)({ data: spell([e]) })).rejects.toThrow(KEY);
    }
    expect(s.sql).toEqual([]);
  });

  it("верная пара — сохраняется; «Забвение 1 Lv» без минут — как было", async () => {
    for (const e of good) expect(() => fn(adminSaveSpell).validate(spell([e]))).not.toThrow();
    await fn(adminSaveSpell)({ data: spell([{ stat: "oblivion", value: "1", minutes: "" }]) });
    expect(s.sql[0]).toContain('[{"stat":"oblivion","value":"1","minutes":""}]');
  });
});

describe("алтарь и храм из режима бога (adminPatchCells)", () => {
  const patch = (buildingConfig: unknown) => ({ cells: [{ q: 1, r: 2, buildingConfig }] });

  it("алтарь: неверное забвение в эффектах — отказ всей выгрузки", () => {
    for (const e of bad) {
      const cfg = { effect: "boost", boost: { effects: [e], prices: [] } };
      expect(() => fn(adminPatchCells).validate(patch(cfg))).toThrow(CELL("1,2"));
    }
  });

  it("храм: «0» или пусто без минут — отказ", () => {
    for (const [level, minutes] of [
      ["0", ""],
      ["", ""],
      ["0-3", "30"],
      ["", "30"],
    ]) {
      const cfg = { oblivion: { prices: [], level, minutes } };
      expect(() => fn(adminPatchCells).validate(patch(cfg))).toThrow(CELL("1,2"));
    }
  });

  it("верное — проходит; клетки без забвения правило не трогает", () => {
    const ok = [
      { oblivion: { prices: [], level: "0", minutes: "30" } },
      { oblivion: { prices: [], level: "2", minutes: "" } },
      { boost: { effects: good, prices: [] } },
      { text: "Табличка" },
      null,
    ];
    for (const cfg of ok) expect(() => fn(adminPatchCells).validate(patch(cfg))).not.toThrow();
  });
});

describe("алтарь и храм из редактора карт (adminSaveHexMap)", () => {
  const map = (buildingConfig: unknown) => ({
    size: 128,
    cells: { "0,0": { terrainId: "grass", buildingId: "b1", buildingConfig } },
  });

  it("неверная пара — отказ сохранения карты с координатами клетки", () => {
    expect(() =>
      fn(adminSaveHexMap).validate(map({ boost: { effects: [bad[0]], prices: [] } })),
    ).toThrow(CELL("0,0"));
    expect(() =>
      fn(adminSaveHexMap).validate(map({ oblivion: { prices: [], level: "", minutes: "" } })),
    ).toThrow(CELL("0,0"));
  });

  it("верное и чужие настройки — проходят", () => {
    for (const cfg of [
      { boost: { effects: good, prices: [] } },
      { oblivion: { prices: [], level: "1-3", minutes: "" } },
      { levelPrices: [] },
      null,
      undefined,
    ]) {
      expect(() => fn(adminSaveHexMap).validate(map(cfg))).not.toThrow();
    }
  });
});
