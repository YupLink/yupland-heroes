// Сохранение черновика турнира (админка): создать или изменить.
//
// Слово владельца (03.10.2026): админ объявляет категорию, число дней (по
// умолчанию 7), места одной колонкой и призы. Расписание (04.10.2026): начало и
// конец по UTC — задано начало, черновик стартует сам. Цена записи (04.10.2026):
// «на выбор что угодно ставит админ», по умолчанию 5 золота; пусто — бесплатно.
// Товары турнира (12.10.2026) — какие зелья засчитываются «Зельям скорости».
// Ошибки — ключами перевода tour.err.*.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { bandsError, fundDarai } from "@/lib/tournament/places";
import { prizeError } from "@/lib/tournament/prizeText";
import { parseUtc, scheduleError } from "@/lib/tournament/schedule";
import { cleanEntryPrice, tourEntryPriceError } from "@/lib/tournament/entryPrice";
import {
  isTourMetric,
  TOUR_MAX_DAYS,
  type TourBand,
  type TourEntryPrice,
  type TourPrizeKind,
  type TourSaveInput,
} from "@/lib/tournament/types";

const prizeZ = z.object({
  // Вид проверяет prizeError (список TOUR_PRIZE_KINDS) — ошибкой-ключом, а не zod.
  kind: z.string().max(16),
  amount: z.number().finite(),
  refId: z.string().max(120).nullish(),
  title: z.string().max(120).nullish(),
  image: z.string().max(1000).nullish(),
});
const bandZ = z.object({ places: z.string().max(20), prizes: z.array(prizeZ).max(20) });
// Ресурс и пределы проверяет tourEntryPriceError — тоже ключом; zod держит форму.
const priceZ = z.object({
  resource: z.string().max(16),
  amount: z.number(),
  token: z.string().max(40).nullish(),
  itemKey: z.string().max(200).nullish(),
  itemName: z.string().max(120).nullish(),
});

/**
 * Товары турнира: id своих товаров (cst_…) без повторов. Нужны только «Зельям
 * скорости» (какие зелья засчитываются; пусто — все со скоростью в бусте), у
 * остальных категорий список пустой.
 */
export function cleanTourItems(metric: string, items: readonly string[]): string[] {
  if (metric !== "potion_drink") return [];
  return [...new Set(items.map((x) => x.trim()).filter((x) => /^cst_[A-Za-z0-9_-]+$/.test(x)))];
}

/** Проверка черновика целиком: ключ ошибки или null. */
export function draftError(d: {
  name: string;
  metric: string;
  days: number;
  bands: TourBand[];
  entryPrice?: TourEntryPrice[];
}): string | null {
  if (!d.name.trim()) return "tour.err.name";
  if (!isTourMetric(d.metric)) return "tour.err.metric";
  if (!Number.isInteger(d.days) || d.days < 1 || d.days > TOUR_MAX_DAYS) return "tour.err.days";
  if (d.bands.length === 0) return "tour.err.no_prize";
  const bands = bandsError(d.bands);
  if (bands) return bands;
  for (const b of d.bands)
    for (const p of b.prizes) {
      const e = prizeError(p);
      if (e) return e;
    }
  return d.entryPrice ? tourEntryPriceError(d.entryPrice) : null;
}

/** Сохранённое начало черновика (мс): его можно оставить, даже если оно прошло. */
async function savedStartMs(id: string): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT extract(epoch from start_at) * 1000 AS ms FROM yuplink.tournament
      WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ ms: number | string | null }> | null;
  const ms = rows?.[0]?.ms;
  return ms == null || !Number.isFinite(Number(ms)) ? null : Number(ms);
}

export const adminTourSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(64).optional(),
        name: z.string().max(80),
        metric: z.string().max(32),
        days: z.number().int(),
        bands: z.array(bandZ).max(50),
        startAt: z.string().max(40).nullish(),
        endAt: z.string().max(40).nullish(),
        // Нет поля (вкладка админки старой версии) — цену не трогаем: у нового
        // черновика ляжет умолчание базы (5 золота), у старого останется своя.
        entryPrice: z.array(priceZ).max(20).optional(),
        // Нет поля (админка старой версии) — список не трогаем.
        items: z.array(z.string().max(64)).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const by = requireAdmin();
    const bands: TourBand[] = data.bands.map((b) => ({
      places: b.places.trim(),
      prizes: b.prizes.map((p) => ({
        kind: p.kind as TourPrizeKind,
        amount: p.amount,
        refId: p.refId?.trim() || null,
        title: p.title?.trim() || null,
        image: p.image?.trim() || null,
      })),
    }));
    const name = data.name.trim();
    const entryPrice = data.entryPrice as TourSaveInput["entryPrice"] | undefined;
    const err = draftError({ name, metric: data.metric, days: data.days, bands, entryPrice });
    if (err) throw new Error(err);
    const [startMs, endMs] = [parseUtc(data.startAt), parseUtc(data.endAt)];
    const keepStartMs = data.id && startMs != null ? await savedStartMs(data.id) : null;
    const timeErr = scheduleError({ startMs, endMs, nowMs: Date.now(), keepStartMs });
    if (timeErr) throw new Error(timeErr);
    const ts = (ms: number | null) =>
      ms == null ? "NULL" : `${sqlStr(new Date(ms).toISOString())}::timestamptz`;
    const fields = {
      name: sqlStr(name),
      metric: sqlStr(data.metric),
      bands: `${sqlStr(JSON.stringify(bands))}::jsonb`,
      fund: fundDarai(bands).toFixed(8),
      start: ts(startMs),
      end: ts(endMs),
      price: entryPrice
        ? `${sqlStr(JSON.stringify(cleanEntryPrice(entryPrice)))}::jsonb`
        : "DEFAULT",
      items: data.items
        ? `${sqlStr(JSON.stringify(cleanTourItems(data.metric, data.items)))}::jsonb`
        : "DEFAULT",
    };
    // Править можно только черновик: идущий турнир уже обещан игрокам. Правка
    // снимает прежнюю причину несостоявшегося автостарта — следующая минута
    // попробует заново. Цену уже записавшиеся не доплачивают и назад не получают:
    // новая цена — для новых записей.
    const rows = (await mcpExec(
      data.id
        ? `UPDATE yuplink.tournament SET name = ${fields.name}, metric = ${fields.metric},
                  days = ${data.days}, bands = ${fields.bands}, fund_darai = ${fields.fund},
                  start_at = ${fields.start}, end_at = ${fields.end}, last_error = NULL
                  ${entryPrice ? `, entry_price = ${fields.price}` : ""}
                  ${data.items ? `, items = ${fields.items}` : ""}
            WHERE id = ${sqlStr(data.id)} AND status = 'draft' RETURNING id;`
        : `INSERT INTO yuplink.tournament
                  (id, name, metric, days, bands, fund_darai, created_by, start_at, end_at, entry_price,
                   items)
           VALUES (${sqlStr(`tour_${nanoid(10)}`)}, ${fields.name}, ${fields.metric}, ${data.days},
                   ${fields.bands}, ${fields.fund}, ${sqlStr(by)}, ${fields.start}, ${fields.end},
                   ${fields.price}, ${fields.items})
           RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    const id = rows?.[0]?.id;
    if (!id) throw new Error("tour.err.state");
    return { id };
  });
