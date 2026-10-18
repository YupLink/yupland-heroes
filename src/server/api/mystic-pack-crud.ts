// Удаление и дублирование мистических боксов (chip_packs kind='mystic').
// Отдельный модуль — mystic.ts уже за 250 строк (§13 ПРАВИЛА.md).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import type { PgChipPack } from "../db/pg";
import { requireAdmin } from "../auth";

/**
 * Удалить бокс-конфиг. Защита: если по этому боксу есть НЕоткрытые гранты
 * (игроки ещё не вскрыли), удалять нельзя — иначе они потеряют содержимое.
 * В этом случае просим сначала деактивировать (тумблер «выкл»).
 */
export const adminDeleteMysticPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const pending = await pg.chipPackGrants
      .raw()
      .select("id", { count: "exact", head: true })
      .eq("chip_pack_id", data.id)
      .is("opened_at", null);
    const n = pending.count ?? 0;
    if (n > 0) {
      throw new Error(
        `Нельзя удалить: ${n} невскрытых боксов на руках у игроков. Сначала выключи бокс (тумблер), чтобы новые не выдавались.`
      );
    }
    await pg.chipPacks.raw().delete().eq("id", data.id).eq("kind", "mystic");
    return { ok: true };
  });

/**
 * Дублировать бокс: создаёт новую копию со всеми настройками (pool, обложка),
 * имя + « (копия)», по умолчанию ВЫКЛючена — чтобы правкой копии под другой
 * бокс случайно не раздать активный дубль. Возвращает id новой копии.
 */
export const adminDuplicateMysticPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const src = (await pg.chipPacks.findOne({ id: data.id })) as PgChipPack | null;
    if (!src || src.kind !== "mystic") throw new Error("Бокс не найден");
    const id = `cp_${nanoid(10)}`;
    const now = new Date().toISOString();
    const wallet = requireAdmin();
    const row: PgChipPack = {
      ...src,
      id,
      name: `${src.name} (копия)`,
      active: false,
      sold_count: 0,
      created_at: now,
      updated_at: now,
      created_by_wallet: wallet,
    };
    await pg.chipPacks.insert(row);
    return { ok: true, id };
  });
