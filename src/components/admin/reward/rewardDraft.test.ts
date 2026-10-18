// Что уезжает из редактора наград в базу.
//
// Редактором настроены ВСЕ боссы на карте, поэтому проверяем не только новые
// виды, но и то, что старые сохраняются как сохранялись. Отдельно — правило
// «награда, которую нечем выдать, в фонд не попадает»: ресурс без кода и товар
// без шаблона доехали бы до выдачи и повисли вечной заявкой в очереди.
import { describe, expect, it } from "vitest";
import {
  DEF_CFG,
  draftProblems,
  fromDraftCfg,
  toDraftCfg,
  type DraftConfig,
  type RewardConfig,
} from "@/components/admin/reward/rewardDraft";

const draft = (fillers: DraftConfig["fillers"]): DraftConfig => ({
  ...DEF_CFG,
  fillers,
  split: ["100"],
});

describe("fromDraftCfg · старые виды", () => {
  it("лайки и энергия сохраняются как были", () => {
    const out = fromDraftCfg(draft([{ kind: "likes", amount: "250" }]));
    expect(out.fillers).toEqual([
      { kind: "likes", amount: 250, token: null, resource: null, itemId: null, toPlace: null },
    ]);
  });

  it("токен без символа в фонд не идёт", () => {
    const out = fromDraftCfg(
      draft([
        { kind: "token", amount: "10", token: null },
        { kind: "token", amount: "5", token: "Darai" },
      ]),
    );
    expect(out.fillers.map((f) => f.token)).toEqual(["Darai"]);
  });
});

describe("fromDraftCfg · ресурс", () => {
  it("код ресурса доезжает до конфига", () => {
    const out = fromDraftCfg(draft([{ kind: "resource", amount: "1200", resource: "gold" }]));
    expect(out.fillers[0]).toMatchObject({ kind: "resource", amount: 1200, resource: "gold" });
  });

  it("ресурс без кода отбрасывается", () => {
    const out = fromDraftCfg(draft([{ kind: "resource", amount: "1200", resource: null }]));
    expect(out.fillers).toEqual([]);
  });

  it("токен в ресурс не переодевается", () => {
    // Darai обязан идти видом token: у него залог свободного пула карты.
    const out = fromDraftCfg(draft([{ kind: "token", amount: "50", token: "Darai" }]));
    expect(out.fillers[0].kind).toBe("token");
    expect(out.fillers[0].resource).toBe(null);
  });
});

describe("fromDraftCfg · свой товар", () => {
  it("шаблон и «до места N» доезжают, количество целое", () => {
    const out = fromDraftCfg(
      draft([{ kind: "custom", amount: "2.7", itemId: "cst_abc12345", toPlace: "3" }]),
    );
    expect(out.fillers[0]).toMatchObject({
      kind: "custom",
      amount: 2,
      itemId: "cst_abc12345",
      toPlace: 3,
    });
  });

  it("без «до места» товар достаётся первому", () => {
    const out = fromDraftCfg(draft([{ kind: "custom", amount: "1", itemId: "cst_abc12345" }]));
    expect(out.fillers[0].toPlace).toBe(1);
  });

  it("товар без шаблона отбрасывается", () => {
    const out = fromDraftCfg(draft([{ kind: "custom", amount: "1", itemId: null }]));
    expect(out.fillers).toEqual([]);
  });
});

describe("draftProblems · молчаливой пропажи быть не должно", () => {
  it("каждая недоукомплектованная строка названа поимённо", () => {
    const bad = draftProblems(
      draft([
        { kind: "likes", amount: "10" },
        { kind: "resource", amount: "1000", resource: null },
        { kind: "custom", amount: "1", itemId: null },
        { kind: "token", amount: "5", token: null },
      ]),
    );
    expect(bad).toEqual(["ресурс без кода", "товар без шаблона", "токен без монеты"]);
  });

  it("доукомплектованный фонд претензий не вызывает", () => {
    expect(draftProblems(draft([{ kind: "resource", amount: "1", resource: "gold" }]))).toEqual([]);
  });

  it("товар с чужим id — такой же мусор, как и на сервере", () => {
    // reward-filler.parseFiller требует префикс cst_. Разойдись правила —
    // админ сохранил бы строку, которую раздача всё равно выбросит.
    const cfg = draft([{ kind: "custom", amount: "1", itemId: "pk_abc12345" }]);
    expect(draftProblems(cfg)).toEqual(["товар без шаблона"]);
    expect(fromDraftCfg(cfg).fillers).toEqual([]);
  });
});

describe("fromDraftCfg · пустой пак", () => {
  it("в конфиг не уезжает", () => {
    // Схема недельного босса требует packId min(1) — пустой ронял сохранение.
    const out = fromDraftCfg({ ...draft([]), packs: [{ packId: "", toPlace: "1" }] });
    expect(out.packs).toEqual([]);
  });
});

describe("fromDraftCfg · чужие поля не тащатся", () => {
  it("админ выбрал ресурс, потом передумал на товар", () => {
    // Оставшийся `resource: gold` в jsonb сбивал бы разбор на сервере.
    const out = fromDraftCfg(
      draft([{ kind: "custom", amount: "1", resource: "gold", itemId: "cst_abc12345" }]),
    );
    expect(out.fillers[0].resource).toBe(null);
    expect(out.fillers[0].itemId).toBe("cst_abc12345");
  });
});

describe("toDraftCfg", () => {
  it("числа становятся строками, ссылки остаются", () => {
    const cfg: RewardConfig = {
      fillers: [
        { kind: "resource", amount: 500, resource: "stone" },
        { kind: "custom", amount: 2, itemId: "cst_abc12345", toPlace: 5 },
      ],
      split: [60, 40],
      packs: [{ packId: "cp_x", toPlace: 3 }],
      items: [],
    };
    const d = toDraftCfg(cfg);
    expect(d.fillers[0]).toMatchObject({ amount: "500", resource: "stone" });
    expect(d.fillers[1]).toMatchObject({ amount: "2", itemId: "cst_abc12345", toPlace: "5" });
    expect(d.split).toEqual(["60", "40"]);
  });

  it("круг «в базу и обратно» ничего не теряет", () => {
    const cfg: RewardConfig = {
      fillers: [
        { kind: "likes", amount: 100, token: null, resource: null, itemId: null, toPlace: null },
        {
          kind: "token",
          amount: 12.5,
          token: "Darai",
          resource: null,
          itemId: null,
          toPlace: null,
        },
        {
          kind: "resource",
          amount: 40,
          token: null,
          resource: "wood",
          itemId: null,
          toPlace: null,
        },
        {
          kind: "custom",
          amount: 3,
          token: null,
          resource: null,
          itemId: "cst_abc12345",
          toPlace: 2,
        },
      ],
      split: [100],
      packs: [],
      items: [],
    };
    expect(fromDraftCfg(toDraftCfg(cfg))).toEqual(cfg);
  });
});
