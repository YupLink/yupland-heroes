// Карта мира: местность, метки построек и мои клады одним ответом.
//
// Открывает её только предмет «Карта» у выбранного героя (владелец,
// 05.10.2026; ПРАВИЛА §8.32): без предмета — никому, ни владельцу, ни админу.
// Два режима: «Разведанное» — ровно то, что увидел бы игрок по своему туману
// войны, и «Вся карта» — с предметом и только админам. Кто что открывает,
// решает worldMapAccess — та же функция, что прячет кружок у миникарты.
//
// Тяжёлые серверные модули — динамическим импортом внутри обработчика: этот
// файл импортирует экран рейда, и всё, что лежит у него сверху, рискует
// уехать в клиентскую сборку (инцидент 27.09: raidLive в бандле телефона).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAdminWallet, isPayoutsAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "./gate";
import { canOpenWorldMap, worldMapAccess } from "@/lib/raid/worldMapAccess";
import type { WorldMapWire } from "@/lib/raid/worldMapCodec";

export const getWorldMap = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["seen", "all"]) }).parse(d))
  .handler(async ({ data }): Promise<WorldMapWire> => {
    const wallet = await requireBetaRaid();
    const { raidOwner } = await import("./owner");
    const { hasMapItem } = await import("./world-map-item");
    const account = await raidOwner(wallet);
    // Права — до чтения карты: без предмета ни клеток, ни меток, ни кладов.
    const access = worldMapAccess({
      owner: isPayoutsAdminWallet(wallet),
      admin: isAdminWallet(wallet),
      hasMapItem: await hasMapItem(account),
    });
    if (!canOpenWorldMap(access, data.mode)) throw new Error("wmap.no_access");
    const { playerMapId } = await import("./encounter-where");
    const { mapBase } = await import("./map-base");
    const { worldMarks } = await import("./world-map-marks");
    const { loadMyTreasures } = await import("./world-map-treasures");
    const { loadSeenIslands } = await import("./world-map-seen");
    const { packWorldMap } = await import("./world-map-pack");
    // Карта ИГРОКА (мультикарта): та, на которой он стоит.
    const mapId = await playerMapId(account);
    // Клетки и словарь местности — из общего кэша основы карты (map-base):
    // отдельного скана карты ради этого ответа нет.
    const [base, marks, treasures, seen] = await Promise.all([
      mapBase(mapId),
      worldMarks(mapId),
      loadMyTreasures(account, mapId),
      data.mode === "seen" ? loadSeenIslands(account, mapId) : null,
    ]);
    return packWorldMap({
      mode: data.mode,
      cells: base.cells,
      terrains: base.terrains,
      marks,
      treasures,
      seen,
    });
  });
