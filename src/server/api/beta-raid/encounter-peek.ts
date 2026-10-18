// Карточка объекта до боя: что за цель, сколько у неё HP, почём вход.
// Ровно те данные, которые окно рейда показывает для босса.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { requireNotVoid } from "./voidGate";
import { parseRewardConfig } from "../raid-shared";
import { loadEncounterTarget } from "./encounter-target";
import { applyCellOverride, loadCellObject, requireCellObject } from "./cell-override";
import { targetFromSnapshot } from "./boss-snapshot";
import { peekObjectHp } from "./encounter-hp";
import { myMapId } from "./encounter-where";
import { decorateRewardConfig } from "./encounter-reward-view";
import { targetDamageRange } from "./encounter-sim";

export const getBetaRaidEncounter = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ objectId: z.string().min(1), q: z.number().int(), r: z.number().int() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    // Карточка цели — та же разведка, что и бой: имя, арт, HP, урон, способности
    // и расшифрованные награды. Клиент внутрь глухого тумана не тапает, но
    // запрос с координатами зоны собирается руками, и ответ выдавал её целиком.
    await requireNotVoid(wallet, mapId, data.q, data.r);

    // Та же сверка, что и в бою: карточка не должна показывать награды
    // объекта, которого на этой клетке нет.
    const cell = await loadCellObject(mapId, data.q, data.r);
    requireCellObject(cell.objectId, data.objectId);
    // Шаблон, а нет его — снимок клетки: босс, чью заготовку удалили, остаётся
    // на карте играбельным по своей копии (boss-snapshot).
    const tpl =
      (await loadEncounterTarget(data.objectId)) ??
      targetFromSnapshot(data.objectId, cell.snapshot);
    if (!tpl) throw new Error("Объект не найден");
    const target = applyCellOverride(tpl, cell.override, cell.terrainBg);
    const hp = await peekObjectHp({ mapId, q: data.q, r: data.r, layer: cell.layer });

    return {
      kind: target.kind,
      objectId: data.objectId,
      name: target.name,
      badgeLabel: target.badgeLabel,
      imageUrl: target.imageUrl,
      backgroundUrl: target.backgroundUrl,
      maxHp: hp?.maxHp ?? target.maxHp,
      currentHp: hp ? hp.currentHp : target.maxHp,
      killed: hp?.killed ?? false,
      interactionCost: target.interactionCost,
      // Сколько цель бьёт за удар — диапазоном, чтобы игрок оценил риск.
      damage: target.kind === "boss" ? targetDamageRange(target.damage ?? undefined) : null,
      // Чем грозит цель — показываем ДО боя, чтобы игрок мог решить.
      abilities: target.abilities.map((a) => ({
        kind: a.kind,
        chance: a.chance,
        value: a.value,
        duration: a.duration,
      })),
      // С названиями паков/предметов: иначе в окне видно техническое id.
      rewardConfig: await decorateRewardConfig(parseRewardConfig(target.rewardConfig)),
    };
  });
