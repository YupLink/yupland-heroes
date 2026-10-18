// Админка писем на весь экран: список, создать/изменить, включить/выключить.
//
// «Только мне» — список из одного аккаунта текущего админа: так владелец
// смотрит письмо на себе, прежде чем открыть его всем. Список «кому» админ
// пишет тем, что знает, — id аккаунта, Telegram-id или кошелёк; сервер
// переводит в аккаунты и отказывает, если кого-то не нашёл.
// Английская версия — по желанию, но целиком (заголовок и текст); «показывать
// до» — новое только в будущем, прошлое можно лишь оставить как было.
// Ошибки — ключами letter.err.* (перевод — src/lib/translations/letters.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { raidOwner } from "../beta-raid/owner";
import {
  letterError,
  letterUntilError,
  textOrNull,
  type LetterAdminList,
  type LetterAdminRow,
  type LetterAudience,
  type LetterSaveInput,
} from "@/lib/letters";
import {
  adminLettersSql,
  forgetSeenSql,
  letterUntilSql,
  resolveAccountsSql,
  saveLetterSql,
  setActiveSql,
  type LetterFields,
} from "./letters-sql";

type AdminDbRow = {
  id: string;
  title: string | null;
  body: string | null;
  image: string | null;
  title_en?: string | null;
  body_en?: string | null;
  audience: string;
  accounts: string[] | null;
  active: boolean;
  created_ms: number | string | null;
  until_ms?: number | string | null;
  seen: number | string | null;
};

/** Миллисекунды из extract(epoch) → ISO; NULL и мусор → null. */
function isoOfMs(v: number | string | null | undefined): string | null {
  const ms = Number(v);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

export function toAdminLetter(r: AdminDbRow): LetterAdminRow {
  return {
    id: r.id,
    title: r.title ?? "",
    body: r.body ?? "",
    image: r.image?.trim() || null,
    titleEn: textOrNull(r.title_en),
    bodyEn: textOrNull(r.body_en),
    audience: r.audience === "all" ? "all" : "list",
    accounts: Array.isArray(r.accounts) ? r.accounts : [],
    active: r.active !== false,
    createdAt: isoOfMs(r.created_ms),
    seen: Number(r.seen) || 0,
    showUntil: isoOfMs(r.until_ms),
  };
}

/** Записи «кому» → аккаунты; неизвестные — ошибкой со списком. */
async function resolveAccounts(entries: string[]): Promise<string[]> {
  const rows = ((await mcpExec(resolveAccountsSql(entries), { wrapJson: true })) ?? []) as Array<{
    entry: string;
    account_id: string | null;
  }>;
  const unknown = rows.filter((r) => !r.account_id).map((r) => r.entry);
  if (unknown.length) throw new Error(`letter.err.unknown:${unknown.slice(0, 5).join(", ")}`);
  return [...new Set(rows.map((r) => r.account_id as string))];
}

/**
 * «Показывать до» в прошлом: новое письмо — ошибка, правка — только если дату не
 * меняли (истёкшее письмо можно поправить, не продлевая). В будущем — без запроса.
 */
async function checkUntilPast(id: string | undefined, until: string | null): Promise<void> {
  const nowMs = Date.now();
  if (!until || Date.parse(until) > nowMs) return;
  let keepUntil: string | null = null;
  if (id) {
    const rows = (await mcpExec(letterUntilSql(id), { wrapJson: true })) as Array<{
      until_ms: number | string | null;
    }> | null;
    keepUntil = isoOfMs(rows?.[0]?.until_ms);
  }
  const err = letterUntilError(until, { nowMs, keepUntil });
  if (err) throw new Error(err);
}

const cleanText = (s: string): string => s.replace(/\r\n?/g, "\n").trim();

/** Форма → строка базы: проверка, «Только мне» и список «кому». */
async function fieldsOf(d: LetterSaveInput, wallet: string): Promise<LetterFields> {
  const title = d.title.trim();
  const body = cleanText(d.body);
  const titleEn = d.titleEn?.trim() || null;
  const bodyEn = cleanText(d.bodyEn ?? "") || null;
  const image = d.image?.trim() || null;
  const until = d.showUntil?.trim() || null;
  const entries = [...new Set(d.accounts.map((a) => a.trim()).filter(Boolean))];
  const err = letterError({
    title,
    body,
    titleEn,
    bodyEn,
    image,
    audience: d.audience,
    accounts: entries,
    showUntil: until,
  });
  if (err) throw new Error(err);
  await checkUntilPast(d.id, until);
  const showUntil = until ? new Date(Date.parse(until)).toISOString() : null;
  let audience: LetterAudience = "list";
  let accounts: string[] = [];
  if (d.audience === "all") audience = "all";
  else if (d.audience === "me") accounts = [await raidOwner(wallet)];
  else accounts = await resolveAccounts(entries);
  return { title, body, titleEn, bodyEn, image, audience, accounts, showUntil };
}

export const adminLetterList = createServerFn({ method: "GET" }).handler(
  async (): Promise<LetterAdminList> => {
    const wallet = requireAdmin();
    const me = await raidOwner(wallet);
    const rows = ((await mcpExec(adminLettersSql(), { wrapJson: true })) ?? []) as AdminDbRow[];
    return { me, letters: rows.map(toAdminLetter) };
  },
);

const saveZ = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().max(400),
  body: z.string().max(8000),
  image: z.string().max(2000).nullish(),
  audience: z.enum(["all", "list", "me"]),
  accounts: z.array(z.string().max(200)).max(1000),
  titleEn: z.string().max(400).nullish(),
  bodyEn: z.string().max(8000).nullish(),
  showUntil: z.string().max(40).nullish(),
  again: z.boolean().optional(),
});

export const adminLetterSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveZ.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const wallet = requireAdmin();
    const fields = await fieldsOf(data, wallet);
    const rows = (await mcpExec(
      saveLetterSql(fields, { id: data.id, newId: `letter_${nanoid(10)}`, by: wallet }),
      { wrapJsonCte: true },
    )) as Array<{ id: string }> | null;
    const id = rows?.[0]?.id;
    if (!id) throw new Error("letter.err.not_found");
    // Правка после пробы: прочитавшие увидят письмо ещё раз.
    if (data.id && data.again) await mcpExec(forgetSeenSql(id));
    return { id };
  });

export const adminLetterSetActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1).max(64), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    requireAdmin();
    const rows = (await mcpExec(setActiveSql(data.id, data.active), {
      wrapJsonCte: true,
    })) as Array<{ id: string }> | null;
    if (!rows?.[0]) throw new Error("letter.err.not_found");
    return { ok: true };
  });
