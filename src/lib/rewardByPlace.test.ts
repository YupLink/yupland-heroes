// Расклад «что достанется какому месту» — обещание, которое видит игрок ДО боя.
//
// Обещание обязано совпадать с раздачей (server/api/beta-raid/encounter-extra),
// поэтому проверяем те же два правила для новых видов: ресурс делится долями,
// но ЦЕЛЫМИ (пол-камня не бывает), а свой товар не делится вовсе — он штучный,
// «до места N», как пак.
import { describe, expect, it } from "vitest";
import { rewardByPlace, type RewardCfgLike } from "@/lib/rewardByPlace";

const cfg = (over: Partial<RewardCfgLike>): RewardCfgLike => ({
  split: [50, 30, 20],
  fillers: [],
  packs: [],
  items: [],
  ...over,
});

describe("ресурс в раскладе", () => {
  it("делится долями мест и показывается кодом ресурса", () => {
    const rows = rewardByPlace(
      cfg({ fillers: [{ kind: "resource", amount: 1000, resource: "gold" }] }),
    );
    expect(rows.map((r) => r.fillers)).toEqual([
      [{ kind: "gold", amount: 500, resource: "gold" }],
      [{ kind: "gold", amount: 300, resource: "gold" }],
      [{ kind: "gold", amount: 200, resource: "gold" }],
    ]);
  });

  it("доля округляется до целого — дробных камней не бывает", () => {
    const rows = rewardByPlace(
      cfg({ split: [60, 40], fillers: [{ kind: "resource", amount: 7, resource: "stone" }] }),
    );
    expect(rows[0].fillers[0]).toEqual({ kind: "stone", amount: 4, resource: "stone" });
    expect(rows[1].fillers[0]).toEqual({ kind: "stone", amount: 3, resource: "stone" });
  });

  it("ресурс без кода не показываем видом «resource»", () => {
    // Такой филлер сервер и не сохранит; если старый конфиг всё же донёс —
    // пусть лучше стоит «resource», чем сломанная строка.
    const rows = rewardByPlace(
      cfg({ split: [100], fillers: [{ kind: "resource", amount: 10, resource: null }] }),
    );
    expect(rows[0].fillers[0].kind).toBe("resource");
  });
});

describe("свой товар в раскладе", () => {
  it("не делится, а достаётся первым N местам штучно", () => {
    const rows = rewardByPlace(
      cfg({
        fillers: [{ kind: "custom", amount: 3, itemId: "cst_abc", toPlace: 2, name: "Пшеница" }],
      }),
    );
    expect(rows[0].prizes).toEqual([
      { kind: "custom", name: "Пшеница", imageUrl: null, amount: 3 },
    ]);
    expect(rows[1].prizes).toHaveLength(1);
    // Третьему месту не достаётся ничего — пустых строк в раскладе не рисуем.
    expect(rows).toHaveLength(2);
    // В делимое товар не попадает — иначе у первого места была бы «1,5 штуки».
    expect(rows.flatMap((r) => r.fillers)).toEqual([]);
  });

  it("«до места» больше числа мест — строки дорисовываются", () => {
    // Как у пака: пресет «Только 1-е» с товаром до 3-го места выдаёт троим.
    const rows = rewardByPlace(
      cfg({
        split: [100],
        fillers: [{ kind: "custom", amount: 1, itemId: "cst_abc", toPlace: 3, name: "Молоко" }],
      }),
    );
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it("без «до места» — только победителю", () => {
    const rows = rewardByPlace(
      cfg({ fillers: [{ kind: "custom", amount: 1, itemId: "cst_abc", name: "Молоко" }] }),
    );
    expect(rows[0].prizes).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it("товар без шаблона в расклад не лезет", () => {
    const rows = rewardByPlace(cfg({ fillers: [{ kind: "custom", amount: 1, itemId: null }] }));
    expect(rows).toEqual([]);
  });
});

describe("старое поведение не тронуто", () => {
  it("лайки делятся дробно, токен показывается тикером", () => {
    const rows = rewardByPlace(
      cfg({
        split: [60, 40],
        fillers: [
          { kind: "likes", amount: 25 },
          { kind: "token", amount: 10, token: "Darai" },
        ],
      }),
    );
    expect(rows[0].fillers).toEqual([
      { kind: "likes", amount: 15, resource: null },
      { kind: "Darai", amount: 6, resource: null },
    ]);
    expect(rows[1].fillers).toEqual([
      { kind: "likes", amount: 10, resource: null },
      { kind: "Darai", amount: 4, resource: null },
    ]);
  });

  it("пак остаётся штучным призом с количеством 1", () => {
    const rows = rewardByPlace(
      cfg({ split: [100], packs: [{ packId: "cp_x", toPlace: 2, name: "Forest Pack" }] }),
    );
    expect(rows[0].prizes[0]).toEqual({
      kind: "pack",
      name: "Forest Pack",
      imageUrl: null,
      amount: 1,
    });
  });
});
