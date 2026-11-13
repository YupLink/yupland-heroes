import {newspaperEditionsInput} from './edition-input';
import {ensureNewspaperEditions} from './edition-schema';
// Редакция газет (§8.96): админы и дизайнер замка (Кай). Выпуск — черновик,
// пока газета не готова и не проверена; «Разместить» раскладывает экземпляры
// по картам (не по расписанию — Кай, 31.10); «Снять» убирает их с карт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireCastleEditor } from "@/server/auth";
import { isNewspaperDate, isNewspaperImageUrl, type NewspaperIssueAdmin } from "@/lib/newspaper";
import { loadNewspaperConfig } from "./paper-config";
import {
  addIssueEnglishSql,
  copiesByMapSql,
  issueStatusSql,
  listIssuesSql,
  publishSql,
  saveIssueSql,
  withdrawSql,
} from "./paper-sql";

const ID_RE = /^npi_[A-Za-z0-9_-]{6,40}$/;

const newId = (): string => `npi_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

async function statusOf(id: string): Promise<string | null> {
  const rows = (await mcpExec(issueStatusSql(id), { wrapJson: true })) as Array<{
    status: string;
  }>;
  return rows?.[0]?.status ?? null;
}

const saveInput = z.object({
  id: z.string().regex(ID_RE).optional(),
  date: z.string().refine(isNewspaperDate, "newspaper.bad_date"),
  title: z.string().trim().max(120).nullable().optional(),
  imageUrl: z.string().refine(isNewspaperImageUrl, "newspaper.bad_image"),
  createOnly: z.boolean().optional(),
  editions: newspaperEditionsInput.optional(),
});

/** Новый черновик (без id) или правка черновика. Размещённый — newspaper.not_draft. */
export const saveNewspaperIssue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const by = await requireCastleEditor();
    if(data.editions && (data.editions.ru.spreadUrls[0]!==data.imageUrl || data.editions.ru.title!==data.title)) throw new Error("newspaper.bad_image");
    if(data.editions) await ensureNewspaperEditions();
    const id = data.id ?? newId();
    const title = data.title ? data.title : null;
    const rows = (await mcpExec(
      saveIssueSql({ id, date: data.date, title, imageUrl: data.imageUrl, by, createOnly:data.createOnly, editions:data.editions }),
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (rows?.[0]?.id) return { id };
    // Повтор моста после успешной вставки тоже вернёт строку; пусто — не черновик.
    // A failed conditional update is a conflict, not a successful save.
    throw new Error("newspaper.not_draft");
  });

export const listNewspaperIssues = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewspaperIssueAdmin[]> => {
    await requireCastleEditor();
    const rows = (await mcpExec(listIssuesSql(), { wrapJson: true })) as NewspaperIssueAdmin[];
    return (rows ?? []).map((r) => ({
      ...r,
      copies: Number(r.copies) || 0,
      reads: Number(r.reads) || 0,
      publishedAt: r.publishedAt ?? null,
    }));
  },
);

const idInput = z.object({ id: z.string().regex(ID_RE) });

export type PublishResult = { status: string; maps: Array<{ map: string; copies: number }> };

/**
 * Разместить черновик на картах. Число экземпляров — из settings
 * (cellsPerCopy); не задано — newspaper.count_not_set. Повтор — тот же итог.
 */
export const publishNewspaperIssue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<PublishResult> => {
    await requireCastleEditor();
    const { cellsPerCopy } = await loadNewspaperConfig();
    if (!cellsPerCopy) throw new Error("newspaper.count_not_set");
    const before = await statusOf(data.id);
    if (!before) throw new Error("newspaper.gone");
    if (before === "draft") await mcpExec(publishSql(data.id, cellsPerCopy));
    const status = await statusOf(data.id);
    if (status !== "published") throw new Error("newspaper.not_draft");
    const maps = (await mcpExec(copiesByMapSql(data.id), { wrapJson: true })) as Array<{
      map: string;
      copies: number;
    }>;
    return { status, maps: (maps ?? []).map((m) => ({ map: m.map, copies: Number(m.copies) })) };
  });

/** Снять размещённый выпуск: экземпляры уходят с карт, киоски его больше не показывают. */
export const withdrawNewspaperIssue = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }): Promise<{ status: string }> => {
    await requireCastleEditor();
    await mcpExec(withdrawSql(data.id));
    const status = await statusOf(data.id);
    if (!status) throw new Error("newspaper.gone");
    return { status };
  });


/** Existing published issue: only add the missing English edition, no new copies. */
export const addNewspaperEnglish = createServerFn({method:'POST'})
 .inputValidator((d:unknown)=>z.object({id:z.string().regex(ID_RE),expectedImageUrl:z.string().refine(isNewspaperImageUrl),editions:newspaperEditionsInput}).parse(d))
 .handler(async({data}):Promise<{id:string}>=>{
   await requireCastleEditor();
   if(data.editions.ru.spreadUrls[0]!==data.expectedImageUrl)throw new Error('newspaper.bad_image');
   await ensureNewspaperEditions();
   const rows=await mcpExec(addIssueEnglishSql(data),{wrapJsonCte:true}) as Array<{id:string}>;
   if(!rows?.[0]?.id)throw new Error('newspaper.not_draft');
   return {id:rows[0].id};
 });
