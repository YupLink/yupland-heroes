// Газеты на карте глазами игрока (§8.96, правила Кай 31.10.2026).
//  · Слой: экземпляры во «втором обзоре» героя; прочитанные и отложенные выпуски не видны.
//  · Открыть: герой на клетке экземпляра или рядом. Картинку отдаём только тут.
//  · Прочитал: окно зовёт по кнопке «Забрать» после загрузки картинки; ошибка загрузки —
//    не зовёт. Все экземпляры выпуска пропадают у этого игрока; есть киоск —
//    выпуск сохраняется в нём.
//  · Прочитать позже: отдельное действие, не прочтение; можно и без киоска,
//    но отложенный выпуск читают только с киоском (Кай, 31.10).
//  · Запись с RETURNING — wrapJsonCte: wrapJson кладёт запрос в подзапрос
//    SELECT, и INSERT/UPDATE там — синтаксическая ошибка.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { actionGate } from "@/server/rateGate";
import { accAccountId } from "@/server/api/currency/move";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { activeBetaMapId, myMapId, ownCell } from "@/server/api/beta-raid/encounter-where";
import { canIgnoreVoid, requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { hexDistance } from "@/server/api/beta-raid/helpers";
import { hasNewspaperKiosk } from "@/server/api/newspaper-kiosk/kiosk-own";
import type { NewspaperSpot, NewspaperView } from "@/lib/newspaper";
import { copySql, deferSql, markSql, nearSql, openSql, readSql } from "./paper-sql";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Кто действует: кошелёк, карта героя, аккаунт (игрок = аккаунт). */
async function paperActor(what: string | null) {
  const wallet = await requireBetaRaid();
  if (what) await actionGate(what, wallet);
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) throw new Error("market.need_account");
  return { wallet, account };
}

/** Экземпляры вокруг героя; героя на карте нет — пусто. */
export const getNewspapersNear = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewspaperSpot[]> => {
    const wallet = await requireBetaRaid();
    const [account, activeMapId] = await Promise.all([raidOwner(wallet), activeBetaMapId()]);
    const rows = (await mcpExec(nearSql({ account, activeMapId, admin: canIgnoreVoid(wallet) }), {
      wrapJson: true,
    })) as Array<Record<string, unknown>>;
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      issueId: String(r.issueId),
      q: num(r.q),
      r: num(r.r),
      deferred: r.deferred === true,
    }));
  },
);

type CopyRow = {
  q: unknown;
  r: unknown;
  issueId: string;
  date: string;
  title: string | null;
  imageUrl: string;
  editions?: import("@/lib/newspaper").NewspaperEditions | null;
  status: string;
  deferred: boolean;
  read: boolean;
  decor: boolean;
};

const copyInput = z.object({ copyId: z.string().min(1).max(80) });

/**
 * Открыть экземпляр: моя карта, опубликован, не под декором, герой вплотную,
 * выпуск мной не прочитан и не отложен; отложенный читают из киоска. Отметка «открыл» —
 * пропуск к «прочитал»/«отложил».
 */
export const openNewspaper = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => copyInput.parse(d))
  .handler(async ({ data }): Promise<NewspaperView> => {
    const { wallet, account } = await paperActor("newspaper");
    const mapId = await myMapId(wallet);
    const rows = (await mcpExec(copySql(data.copyId, mapId, account), {
      wrapJson: true,
    })) as CopyRow[];
    const c = rows?.[0];
    if (!c || c.status !== "published" || c.decor === true) throw new Error("newspaper.gone");
    if (c.read === true) throw new Error("newspaper.already_read");
    if (c.deferred === true) throw new Error("newspaper.gone");
    const pos = await ownCell(wallet);
    if (!pos || hexDistance(pos.q, pos.r, num(c.q), num(c.r)) > 1) {
      throw new Error("newspaper.approach");
    }
    await requireNotVoid(wallet, mapId, num(c.q), num(c.r));
    const kiosk = await hasNewspaperKiosk(account);
    await mcpExec(openSql(account, c.issueId));
    return {
      issueId: c.issueId,
      date: c.date,
      title: c.title ?? null,
      imageUrl: c.imageUrl,
      editions: c.editions ?? null,
      deferred: false,
      read: false,
      kiosk,
      canDefer: true,
    };
  });

const issueInput = z.object({ issueId: z.string().regex(/^npi_[A-Za-z0-9_-]{6,40}$/) });

/** Почему пустой UPDATE: не открывал (или выпуск снят) / уже прочитан / отложен без киоска. */
async function markProblem(account: string, issueId: string, kiosk: boolean): Promise<string> {
  const rows = (await mcpExec(markSql(account, issueId), { wrapJson: true })) as Array<{
    read: boolean;
    deferred: boolean;
  }>;
  const row = rows?.[0];
  if (!row) return "newspaper.not_opened";
  if (row.read === true) return "newspaper.already_read";
  return row.deferred === true && !kiosk ? "newspaper.need_kiosk" : "newspaper.not_opened";
}

/**
 * Забрать (картинка загрузилась, игрок нажал кнопку). Повтор безвреден: время и
 * «сохранён в киоске» — от первого прочтения.
 */
export const markNewspaperRead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => issueInput.parse(d))
  .handler(async ({ data }): Promise<{ read: true; saved: boolean }> => {
    const { account } = await paperActor("newspaper");
    const kiosk = await hasNewspaperKiosk(account);
    const rows = (await mcpExec(readSql(account, data.issueId, kiosk), {
      wrapJsonCte: true,
    })) as Array<{ saved: boolean }>;
    const row = rows?.[0];
    if (!row) throw new Error(await markProblem(account, data.issueId, kiosk));
    return { read: true, saved: row.saved === true };
  });

/** «Прочитать позже»: не прочтение; выпуск ложится в «Отложенные» киоска (сейчас или когда построят). */
export const deferNewspaper = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => issueInput.parse(d))
  .handler(async ({ data }): Promise<{ deferred: true }> => {
    const { account } = await paperActor("newspaper");
    const rows = (await mcpExec(deferSql(account, data.issueId), { wrapJsonCte: true })) as Array<{
      ok: boolean;
    }>;
    if (!rows?.[0]?.ok) throw new Error(await markProblem(account, data.issueId, true));
    return { deferred: true };
  });
