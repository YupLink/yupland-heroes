// Админка промокодов (окно «Промокоды» в профиле): завести, список со
// счётчиками, вкл/выкл, удалить. Каждая ручка — promoActor ПЕРВОЙ строкой
// (админ — всё; право promo_soft — энергия и лайки, только свои коды).
//
// Строку-токен заводит только владелец (requirePayoutsAdmin, как прямое
// начисление в казначействе) и только с объёмом; ресурсы, лайки, энергия и
// вещи — любой админ, как подарки. Ссылка каждой строки проверяется по
// своему справочнику: несуществующий бокс выдать нечем.
//
// Удаление честное только у кода, который никто не вводил: у введённого есть
// активации (на них держится «уже вводил» и выдача по ключам), поэтому он
// лишь выключается.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { isPayoutsAdminWallet } from "@/server/auth";
import { assertPackMoneyRight } from "@/server/api/mystic-money";
import { assertSoftKinds, ownerOf, promoActor } from "./promo-actor";
import { parsePromoRange } from "@/lib/promo/promoRange";
import { generatePromoCode } from "@/lib/promo/promoCode";
import { promoOwnerOnly, type PromoCodeAdmin } from "@/lib/promo/promoTypes";
import { createInput, idInput, listInput, toggleInput, type LineInput } from "./promo-input";
import {
  createSql,
  deleteSql,
  listOf,
  listSql,
  ownCodeSql,
  refsSql,
  toggleSql,
  type NewLine,
} from "./promo-admin-sql";

/** Строка формы → строка базы (диапазон уже проверен схемой). */
function newLineOf(l: LineInput): NewLine {
  // «Ничего»: только вес; база хранит количество 1 и без объёма.
  if (l.kind === "nothing") {
    return {
      kind: l.kind,
      ref: null,
      title: null,
      image: null,
      min: 1,
      max: 1,
      chance: l.chance,
      budget: null,
    };
  }
  const range = parsePromoRange(l.amount) ?? { min: 1, max: 1 };
  return {
    kind: l.kind,
    ref: l.ref || null,
    title: l.title || null,
    image: l.image || null,
    min: range.min,
    max: range.max,
    chance: l.chance,
    budget: l.budget,
  };
}

type Created = { id: string | null; code: string | null };

/** Каждая ссылка есть в своём справочнике; нет — отказ до записи. */
async function assertRefsExist(lines: NewLine[]): Promise<void> {
  const refs = lines.flatMap((l, idx) => (l.ref ? [{ idx, kind: l.kind, ref: l.ref }] : []));
  if (refs.length === 0) return;
  const rows = (await mcpExec(refsSql(refs), { wrapJson: true })) as Array<{ ok?: boolean }>;
  if ((rows ?? []).length !== refs.length || rows.some((r) => r?.ok !== true)) {
    throw new Error("promo.err_ref_missing");
  }
}

const firstRow = (rows: unknown): Record<string, unknown> =>
  (Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined) ?? {};

export const adminCreatePromo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string; code: string }> => {
    const actor = await promoActor();
    const by = actor.by;
    assertSoftKinds(
      actor,
      data.lines.map((l) => l.kind),
    );
    if (data.lines.some((l) => promoOwnerOnly(l.kind)) && !isPayoutsAdminWallet(by)) {
      throw new Error("promo.err_token_owner");
    }
    const id = `pcd_${data.opId}`;
    const lines = data.lines.map(newLineOf);
    await assertRefsExist(lines);
    // Бокс с DARAI/Stars внутри — те же деньги, что строка-токен.
    for (const l of lines) if (l.kind === "pack") await assertPackMoneyRight(l.ref);
    // Свой код — как ввёл админ; пусто — придумываем (редкое совпадение —
    // ещё попытка).
    const tries = data.code ? [data.code] : [0, 1, 2].map(() => generatePromoCode());
    for (const code of tries) {
      const res = firstRow(
        await mcpExec(createSql({ id, code, maxUsers: data.maxUsers, createdBy: by, lines })),
      );
      if (typeof res.id === "string" && res.id) return { ok: true, id, code };
      // Пустой id: либо код занят, либо это повтор нашего же «Создать».
      const own = firstRow(await mcpExec(ownCodeSql(id), { wrapJson: true })) as Created;
      if (own.id === id && own.code) return { ok: true, id, code: own.code };
    }
    throw new Error("promo.err_code_taken");
  });

/** Свежие коды; more — есть старше (кнопка «Показать ещё» растит limit). */
export const adminListPromos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data: limit }): Promise<{ rows: PromoCodeAdmin[]; more: boolean }> => {
    const owner = ownerOf(await promoActor());
    const rows = listOf(await mcpExec(listSql(limit, owner), { wrapJson: true }));
    return { rows: rows.slice(0, limit), more: rows.length > limit };
  });

export const adminTogglePromo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data }) => {
    const owner = ownerOf(await promoActor());
    const done = (await mcpExec(toggleSql(data.id, data.active, owner), {
      wrapJsonCte: true,
    })) as unknown[];
    if (owner && (done ?? []).length === 0) throw new Error("promo.err_not_yours");
    return { ok: true as const };
  });

/** deleted = false — код уже вводили, он выключен вместо удаления. */
export const adminDeletePromo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data }) => {
    const owner = ownerOf(await promoActor());
    // Гонка с вводом (активация легла между проверкой и удалением) упадёт на
    // внешнем ключе — тогда тоже просто выключаем.
    const gone = (await mcpExec(deleteSql(data.id, owner), { wrapJsonCte: true }).catch(
      () => [],
    )) as unknown[];
    if (gone.length > 0) return { ok: true as const, deleted: true };
    const off = (await mcpExec(toggleSql(data.id, false, owner), {
      wrapJsonCte: true,
    })) as unknown[];
    if (owner && (off ?? []).length === 0) throw new Error("promo.err_not_yours");
    return { ok: true as const, deleted: false };
  });
