// Музей: тот же фарм коллекций, что живёт в разделе Фишки, только на карте.
//
// Никакого нового учёта нет: используем ровно те функции, что уже фармят
// коллекции (chips-farm). Здесь добавляется только гейт «стой у музея» и
// оборачивание в server-fn с cell-инпутом — чтобы клиент не хардкодил ключи и
// не звал фарм-эндпоинты напрямую.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { museumAt } from "./museum-gate";
import { getMyCollectionFarms, claimCollectionFarmCore } from "../chips-farm";
import { listChipCollectionsPublic } from "../chips-stake-farm";

const cell = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);
const cellColl = (d: unknown) =>
  z.object({ q: z.number().int(), r: z.number().int(), collectionId: z.string().min(1) }).parse(d);

export const getMuseum = createServerFn({ method: "GET" })
  .inputValidator(cell)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const here = await museumAt(wallet, mapId, data.q, data.r);
    // Список коллекций — общий: у фарма нет привязки к клетке, зачем ей быть.
    // getMyCollectionFarms читает того же wallet, что мы уже проверили гейтом.
    // Тянем и «мои фарм-данные», и общий список коллекций (обложка/тираж/прогресс) —
    // CollectionCard ждёт именно такой формат. Одна параллель — быстрее.
    const [farms, publics] = await Promise.all([
      getMyCollectionFarms(),
      listChipCollectionsPublic(),
    ]);
    const pubById = new Map(publics.map((c) => [c.id, c] as const));
    const collections = farms
      .map((f) => {
        const p = pubById.get(f.collectionId);
        if (!p) return null;
        return {
          collection: {
            id: p.id,
            name: p.name,
            coverImageUrl: p.coverImageUrl,
            mintedCount: p.mintedCount,
            initialSupply: p.initialSupply,
            progress: p.progress,
          },
          farm: f,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return { here, collections };
  });

export const claimMuseumFarm = createServerFn({ method: "POST" })
  .inputValidator(cellColl)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const here = await museumAt(wallet, mapId, data.q, data.r);
    if (!here.built) throw new Error("Музей ещё не построен");
    // Третий тир и выше добавляют по 20% к сбору — считает сам музей, фарм об
    // этом не знает и остаётся общим для всех входов.
    return claimCollectionFarmCore(wallet, data.collectionId, here.bonusPct);
  });
