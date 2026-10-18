import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";
import { SENDLER_DEFAULT_CONTRACT } from "./admin-helpers";
import {
  fetchSendlerPage,
  listCollectionTitlesRaw,
  getScanStateRaw,
  resetCollectionScanRaw,
  upsertCollectionTitles,
  normalizeTitle,
} from "./admin-campaigns-scan";

export const listCollectionTitles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().optional(),
        contractAddress: z.string().default(SENDLER_DEFAULT_CONTRACT),
        limit: z.number().int().positive().max(200).default(50),
      })
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const q = (data.q ?? "").trim();
    return await listCollectionTitlesRaw(data.contractAddress, q, data.limit);
  });

export const getScanState = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const contractId = SENDLER_DEFAULT_CONTRACT;
    return await getScanStateRaw(contractId);
  }
);

export const resetCollectionScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contractAddress: z.string().default(SENDLER_DEFAULT_CONTRACT),
      })
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await resetCollectionScanRaw(data.contractAddress);
    return { ok: true };
  });

/**
 * Сканирует следующие N батчей (по 5000) от текущего lastSkip ПАРАЛЛЕЛЬНО.
 * Один вызов: `pages` страниц по 5000 = `pages * 5000` items за раз.
 */
export const scanCollection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        contractAddress: z.string().default(SENDLER_DEFAULT_CONTRACT),
        pages: z.number().int().positive().max(20).default(10),
        resume: z.boolean().default(true),
      })
      .parse(d ?? {})
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const BATCH = 5000;
    const contractId = data.contractAddress;

    let state = await pg.scanState.findOne({ contract_id: contractId });
    if (!state) {
      await pg.scanState.insert({
        contract_id: contractId,
        last_skip: 0,
        total_seen: 0,
      });
      state = {
        contract_id: contractId,
        last_skip: 0,
        total_seen: 0,
        last_scanned_at: null,
      };
    }
    const startSkip = data.resume ? state.last_skip : 0;
    let totalSeen = data.resume ? state.total_seen : 0;

    const offsets = Array.from(
      { length: data.pages },
      (_, i) => startSkip + i * BATCH
    );
    const pages = await Promise.all(
      offsets.map((skip) => fetchSendlerPage(contractId, skip, BATCH))
    );

    const grouped = new Map<
      string,
      { title: string; image: string; count: number }
    >();
    let itemsThisRun = 0;
    let endOfCollection = false;
    for (const items of pages) {
      itemsThisRun += items.length;
      if (items.length < BATCH) endOfCollection = true;
      for (const it of items) {
        const t = (it.title ?? "").trim();
        if (!t) continue;
        const key = normalizeTitle(t);
        const cur = grouped.get(key);
        if (cur) {
          cur.count++;
        } else {
          grouped.set(key, { title: t, image: it.media ?? "", count: 1 });
        }
      }
    }

    await upsertCollectionTitles(contractId, grouped);

    // Резюм перескочил конец коллекции: перечитать ХВОСТ
    if (data.resume && itemsThisRun === 0 && startSkip > 0) {
      const TAIL = 40000;
      const tailStart = Math.max(0, startSkip - TAIL);
      const tailOffsets = Array.from(
        { length: Math.floor(TAIL / BATCH) + 1 },
        (_, i) => tailStart + i * BATCH
      );
      const tailPages = await Promise.all(
        tailOffsets.map((s) => fetchSendlerPage(contractId, s, BATCH))
      );
      const tailGrouped = new Map<
        string,
        { title: string; image: string; count: number }
      >();
      let realEnd = tailStart;
      for (let pi = 0; pi < tailPages.length; pi++) {
        const items = tailPages[pi];
        realEnd = tailOffsets[pi] + items.length;
        for (const it of items) {
          const t = (it.title ?? "").trim();
          if (!t) continue;
          const k = normalizeTitle(t);
          const cur = tailGrouped.get(k);
          if (cur) cur.count++;
          else tailGrouped.set(k, { title: t, image: it.media ?? "", count: 1 });
        }
      }
      const tailIds = Array.from(tailGrouped.keys()).map((k) => `${contractId}:${k}`);
      const exSet = new Set<string>();
      for (let i = 0; i < tailIds.length; i += 500) {
        const chunk = tailIds.slice(i, i + 500);
        const rows =
          ((await pg.collectionTitles.raw().select("id").in("id", chunk))
            .data as Array<{ id: string }>) ?? [];
        for (const r of rows) exSet.add(r.id);
      }
      const nowIso = new Date().toISOString();
      const newRows = Array.from(tailGrouped.entries())
        .filter(([k]) => !exSet.has(`${contractId}:${k}`))
        .map(([k, g]) => ({
          id: `${contractId}:${k}`,
          contract_id: contractId,
          title: g.title,
          image: g.image || null,
          count: g.count,
          scanned_at: nowIso,
        }));
      for (let i = 0; i < newRows.length; i += 500) {
        await pg.collectionTitles.upsert(newRows.slice(i, i + 500), {
          onConflict: "id",
        });
      }
      await pg.scanState.update(
        { contract_id: contractId },
        { last_skip: realEnd, total_seen: realEnd, last_scanned_at: nowIso }
      );
      return {
        contractId,
        pagesDone: tailPages.length,
        itemsThisRun: 0,
        titlesAddedOrUpdated: newRows.length,
        lastSkip: realEnd,
        totalSeen: realEnd,
        endOfCollection: true,
        tailRefresh: true,
      };
    }

    totalSeen += itemsThisRun;
    const newSkip = startSkip + itemsThisRun;

    await pg.scanState.update(
      { contract_id: contractId },
      {
        last_skip: newSkip,
        total_seen: totalSeen,
        last_scanned_at: new Date().toISOString(),
      }
    );

    return {
      contractId,
      pagesDone: pages.length,
      itemsThisRun,
      titlesAddedOrUpdated: grouped.size,
      lastSkip: newSkip,
      totalSeen,
      endOfCollection,
    };
  });
