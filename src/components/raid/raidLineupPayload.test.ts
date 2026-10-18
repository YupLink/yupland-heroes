// Тренировочная в старый рейд уходит с training/chipId — иначе сервер её не найдёт.
import { describe, expect, it } from "vitest";
import { toRaidLineup } from "./raidLineupPayload";

describe("toRaidLineup", () => {
  it("обычная фишка — без лишних полей, тренировочная — с chipId", () => {
    const out = toRaidLineup([
      { templateId: "t1", level: 3, serialNo: 7, image: "", name: "A" },
      {
        templateId: "train:2",
        level: 2,
        image: "",
        name: "T",
        training: true,
        trainingId: "htc_1",
      },
    ]);
    expect(out[0]).toEqual({ templateId: "t1", level: 3, serialNo: 7 });
    expect(out[1]).toEqual({
      templateId: "train:2",
      level: 2,
      serialNo: null,
      training: true,
      chipId: "htc_1",
    });
  });
});
