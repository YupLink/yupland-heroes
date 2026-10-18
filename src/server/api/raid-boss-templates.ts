// Удаление шаблона босса — и что при этом происходит с его копиями на карте.
//
// Раньше удаление было одной строкой: шаблон исчезал, а клетки продолжали на
// него ссылаться. Такая клетка считалась занятой живым объектом, но показать
// было нечего — на карте оставалась чёрная точка, мимо которой не пройти и с
// которой нечего делать (11 штук на боевой карте, август 2026).
//
// Теперь у удаления два исхода, и оба честные:
//   • без галочки — шаблон уходит, копии остаются играбельными по снимку,
//     который впечатывается в каждую клетку перед удалением (boss-snapshot);
//   • с галочкой — копии убираются с карты, но ТОЛЬКО полные: клетку, где
//     босса донастраивали руками, зачистка не трогает.
//
// Живёт отдельным файлом, а не в raid-admin.ts: тот и без того на восемьсот
// строк (§13 ПРАВИЛА.md), и класть туда ещё одну ветку было бы хуже.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";
import { sqlStr } from "./raid-shared";
import { customCellSql, dropPlainCopiesSql, stampSnapshotSql } from "./beta-raid/boss-snapshot";
import { readDaraiHold, settleDaraiHold } from "./beta-raid/map-darai-hold";

type CellRow = { map_id: string; map_name: string | null; q: number; r: number; custom: boolean };

/** Все клетки всех карт, где стоит этот босс, с пометкой «донастроена». */
async function loadCopies(templateId: string): Promise<CellRow[]> {
  const rows = (await mcpExec(
    `SELECT c.map_id, m.name AS map_name, c.q, c.r, ${customCellSql()} AS custom
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.raid_maps m ON m.id = c.map_id
      WHERE c.object_id = ${sqlStr(`boss:${templateId}`)}
      ORDER BY c.map_id, c.q, c.r;`,
    { wrapJson: true },
  )) as Array<{ map_id: string; map_name: string | null; q: number; r: number; custom: unknown }>;
  return (rows ?? []).map((r) => ({
    map_id: r.map_id,
    map_name: r.map_name ?? null,
    q: Number(r.q),
    r: Number(r.r),
    // Булево приезжает через row_to_json и разбор python-repr — читаем терпимо,
    // как isVoidFlag в packCells: строгое `=== true` здесь молча объявило бы
    // все клетки полными копиями и снесло бы донастроенные заодно.
    custom: r.custom === true || r.custom === 1 || r.custom === "t" || r.custom === "true",
  }));
}

export type BossTemplateUsage = {
  /** Всего копий на всех картах. */
  total: number;
  /** Из них донастроенных на своей клетке — зачистка их не трогает. */
  custom: number;
  /** Полных копий — столько уберётся с галочкой. */
  plain: number;
  /** По картам, чтобы админ видел, где именно стоит босс. */
  maps: Array<{ mapId: string; name: string; total: number; custom: number }>;
};

/** Сколько копий шаблона на картах — вопрос ДО удаления, ничего не меняет. */
export const adminBossTemplateUsage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<BossTemplateUsage> => {
    requireAdmin();
    const cells = await loadCopies(data.id);
    const byMap = new Map<string, { mapId: string; name: string; total: number; custom: number }>();
    for (const c of cells) {
      const row = byMap.get(c.map_id) ?? {
        mapId: c.map_id,
        name: c.map_name ?? c.map_id,
        total: 0,
        custom: 0,
      };
      row.total += 1;
      if (c.custom) row.custom += 1;
      byMap.set(c.map_id, row);
    }
    const custom = cells.filter((c) => c.custom).length;
    return {
      total: cells.length,
      custom,
      plain: cells.length - custom,
      maps: [...byMap.values()].sort((a, b) => b.total - a.total),
    };
  });

export const adminDeleteBossTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        /** Убрать с карты и полные копии. Донастроенные остаются в любом случае. */
        removeCopies: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const copies = await loadCopies(data.id);
    const plain = copies.filter((c) => !c.custom);
    const custom = copies.length - plain.length;

    // 1. Снимок — ПЕРВЫМ и всегда, даже под зачистку: донастроенные клетки
    //    остаются на карте, и им нужен свой экземпляр босса.
    if (copies.length > 0) await mcpExec(stampSnapshotSql(data.id), { wrapJson: false });

    // 2. Зачистка полных копий. Обеспечение Darai сводим тем же порядком, что
    //    и правка карты (admin-live-batch): снимок до — правка — сведение
    //    после. Иначе бронь опустевшей клетки осталась бы в пуле навсегда.
    let removed = 0;
    if (data.removeCopies && plain.length > 0) {
      const byMap = new Map<string, Array<{ q: number; r: number }>>();
      for (const c of plain)
        byMap.set(c.map_id, [...(byMap.get(c.map_id) ?? []), { q: c.q, r: c.r }]);
      const holds = await Promise.all(
        [...byMap].map(async ([mapId, cells]) => readDaraiHold(mapId, cells)),
      );
      for (const sql of dropPlainCopiesSql(data.id)) await mcpExec(sql, { wrapJson: false });
      for (const hold of holds) await settleDaraiHold(hold);
      removed = plain.length;
    }

    // 3. Сам шаблон — последним: до этого момента снимок ещё берётся из него.
    await pg.raidBossTemplate.delete({ id: data.id });
    return { ok: true, removed, kept: copies.length - removed, custom };
  });
