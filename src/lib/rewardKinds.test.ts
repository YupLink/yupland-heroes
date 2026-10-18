// Подписи и картинки новых видов награды.
//
// Проверяем ровно то место, где вид награды превращается в то, что читает
// игрок. Раньше здесь ломались две вещи: «gold» уходил в интерфейс сырой
// строкой, а спрайт алмазов не находился, потому что в наградах ресурс зовётся
// diamonds, а картинка лежит под именем crystal.
import { describe, expect, it } from "vitest";
import {
  REWARD_RESOURCES,
  isRewardResource,
  resourceOfKind,
  rewardKindImage,
  rewardKindLabelKey,
} from "@/lib/rewardKinds";
import { RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { dict } from "@/lib/translations";

describe("isRewardResource", () => {
  it("пропускает четыре ресурса счёта", () => {
    for (const code of REWARD_RESOURCES) expect(isRewardResource(code)).toBe(true);
  });

  it("токен ресурсом не считается", () => {
    // Ключевой случай: Darai видом «ресурс» обошёл бы залог пула карты.
    expect(isRewardResource("token")).toBe(false);
    expect(isRewardResource("Darai")).toBe(false);
    expect(isRewardResource("likes")).toBe(false);
    expect(isRewardResource(null)).toBe(false);
    expect(isRewardResource(undefined)).toBe(false);
  });
});

describe("resourceOfKind", () => {
  it("понимает вид, пришедший кодом ресурса", () => {
    // Так отдаёт таблица мест: kind = сам код (см. encounter-prizes).
    expect(resourceOfKind("gold")).toBe("gold");
    expect(resourceOfKind("diamonds")).toBe("diamonds");
  });

  it("понимает вид «resource» со ссылкой отдельным полем", () => {
    // Так лежит в очереди наград: reward_kind='resource', pack_id=код.
    expect(resourceOfKind("resource", "stone")).toBe("stone");
    expect(resourceOfKind("resource", "wood")).toBe("wood");
  });

  it("чужая ссылка ресурсом не становится", () => {
    expect(resourceOfKind("resource", "cst_abc")).toBe(null);
    expect(resourceOfKind("resource", null)).toBe(null);
    expect(resourceOfKind("custom", "cst_abc")).toBe(null);
    expect(resourceOfKind("pack", "cp_x")).toBe(null);
  });
});

describe("rewardKindImage", () => {
  it("у каждого ресурса есть спрайт", () => {
    for (const code of REWARD_RESOURCES) {
      expect(rewardKindImage(code)).toMatch(/^\/resources\/.+\.webp$/);
    }
  });

  it("алмазы берут картинку кристалла", () => {
    // В наградах ресурс — diamonds, файл — crystal.webp. Раньше на этом месте
    // получалась битая ссылка.
    expect(rewardKindImage("diamonds")).toContain("/resources/crystal.webp");
    expect(rewardKindImage("resource", "diamonds")).toContain("/resources/crystal.webp");
  });

  it("не ресурс — картинки нет", () => {
    expect(rewardKindImage("custom", "cst_abc")).toBe(null);
    expect(rewardKindImage("pack")).toBe(null);
    expect(rewardKindImage("Darai")).toBe(null);
  });
});

describe("rewardKindLabelKey", () => {
  it("у ресурсов и товара есть ключ перевода, и он живёт в словаре", () => {
    const keys = [
      ...REWARD_RESOURCES.map((code) => rewardKindLabelKey(code)),
      rewardKindLabelKey("custom"),
    ];
    for (const key of keys) {
      expect(key).toBeTruthy();
      const entry = (dict as Record<string, { ru: string; en: string }>)[key!];
      // Обе половины обязательны: правило репо — новый текст сразу ru+en.
      expect(entry?.ru).toBeTruthy();
      expect(entry?.en).toBeTruthy();
    }
  });

  it("токен ключа не получает — у него свой тикер", () => {
    expect(rewardKindLabelKey("token")).toBe(null);
    expect(rewardKindLabelKey("Darai")).toBe(null);
    expect(rewardKindLabelKey("pack")).toBe(null);
  });
});

describe("справочник админки", () => {
  it("для каждого ресурса награды есть русская подпись", () => {
    // Селект в редакторе наград берёт подписи отсюда: молчащий undefined
    // выглядел бы как пустой пункт списка.
    for (const code of REWARD_RESOURCES) expect(RESOURCE_LABELS_RU[code]).toBeTruthy();
  });
});
