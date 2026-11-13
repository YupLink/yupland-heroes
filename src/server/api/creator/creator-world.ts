// Мир креатора целиком: копия и расширение рамки.
//
// Владелец, 07.11.2026: «расширять редактируемый мир без смены мира — с 64×64
// до 128; 256; 512 — смена только расширяет границы, созданное никуда не
// пропадает»; «из любого мира можно создать копию и продолжить менять».
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { CREATOR_PREFIX, CREATOR_SIZES, cleanWorkName } from "@/lib/raid/creator/ids";
import { insertWorkSql } from "./creator-sql";
import { copyMapSql, growFrameSql, setSizeSql } from "./creator-map-sql";
import { ownCount, CREATOR_MAX_WORKS, type WorkRef } from "./creator-store";

async function rebuilt(mapId: string): Promise<void> {
  const { purgeMapBase } = await import("../beta-raid/map-base");
  purgeMapBase(mapId);
  const { noteMapRebuilt } = await import("../beta-raid/map-change-hooks");
  await noteMapRebuilt(mapId);
  const { publishRaid } = await import("@/server/raidLive");
  publishRaid({ mapId, type: "restored" });
}

/**
 * Расширить рамку: дописать пустые клетки вокруг старой (ничего не трогая) и
 * сменить размер. Повтор безопасен: вставка ON CONFLICT DO NOTHING.
 */
export async function expandWork(mapId: string, from: number, to: number): Promise<number> {
  if (!(CREATOR_SIZES as readonly number[]).includes(to) || to <= from) {
    throw new Error("creator.bad_size");
  }
  await mcpExec(growFrameSql(mapId, to), { wrapJson: false });
  await mcpExec(setSizeSql(mapId, to), { wrapJson: false });
  await rebuilt(mapId);
  return to * to - from * from;
}

/** Копия мира в новый мой: та же рамка и всё, что на клетках. */
export async function copyWork(
  account: string,
  from: WorkRef,
  lang: "ru" | "en",
): Promise<WorkRef> {
  if ((await ownCount(account)) >= CREATOR_MAX_WORKS) throw new Error("creator.too_many");
  const suffix = lang === "en" ? " — copy" : " — копия";
  const name = cleanWorkName(`${from.name.slice(0, 60 - suffix.length)}${suffix}`) ?? from.name;
  const mapId = `${CREATOR_PREFIX}${nanoid(10)}`;
  const statements = [
    ...copyMapSql(from.mapId, mapId, name),
    insertWorkSql({ mapId, name, owner: account, spawn: from.spawn }),
  ];
  try {
    for (const s of statements) await mcpExec(s, { wrapJson: false });
  } catch (e) {
    const { dropIsland } = await import("../beta-raid/island/island-create");
    await dropIsland(mapId).catch(() => {});
    throw e;
  }
  return { mapId, owner: account, spawn: from.spawn, role: "owner", size: from.size, name };
}
