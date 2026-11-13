// Ремонт артефактов в кузнице (владелец, 23.10.2026; ПРАВИЛА §8.72): «чтобы можно
// было починить все артефакты — такая кнопка. И чтобы можно было выбрать, какие
// именно починить, и они разом чинились».
//
//  • Список — изношенные (wear > 0) артефакты аккаунта: инвентарь и надетые на
//    его героев; залог рынка героев — не его. Читать можно где угодно.
//  • Починка — только стоя у кузницы (шаблон FORGE_TEMPLATE_ID на карте игрока):
//    на её клетке или соседней — то же правило, что у окна любой постройки
//    (requireAdjacent: гекс-расстояние ≤ 1), и не под куполом (requireNotVoid).
//  • Всё пишет одна функция базы art_repair (migrations/art-repair-01.sql): замок
//    'res:' аккаунта, строки артефактов FOR UPDATE, сверка владельца и износа по
//    каждому id, сумма по редкостям, списание res_move 'art_repair', износ в ноль,
//    ключ нажатия. Отказ — до любых записей; повтор нажатия — тот же итог.
//  • Пока владелец не сказал «запускаем» — только админы (art-repair-gate).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { actionGate } from "@/server/rateGate";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { FORGE_TEMPLATE_ID, type ArtRepairDone, type ArtRepairItem } from "@/lib/hero/artRepair";
import { requireArtRepair } from "./art-repair-gate";
import { withEnchantPcts } from "@/server/api/beta-raid/enchant/enchant-attach";
import {
  REPAIR_LIST_LIMIT,
  repairCallSql,
  repairDbError,
  repairDoneOf,
  repairItemOf,
  repairListSql,
  repairRefusal,
  type RepairListRow,
  type RepairResult,
} from "./art-repair-sql";

/** Изношенные артефакты аккаунта для окна ремонта. */
export async function repairListFor(account: string): Promise<ArtRepairItem[]> {
  const rows = (await mcpExec(repairListSql(account), { wrapJson: true })) as RepairListRow[];
  const items = (rows ?? []).slice(0, REPAIR_LIST_LIMIT).map(repairItemOf);
  return withEnchantPcts(items, (i) => i.id); // ✦ у зачарованных (§8.87)
}

/**
 * Игрок стоит у кузницы (q, r): клетка его карты с шаблоном «Кузница», он на ней
 * или рядом, клетка не под куполом. Иначе — отказ ключом словаря.
 */
export async function requireAtForge(wallet: string, q: number, r: number): Promise<void> {
  const mapId = await myMapId(wallet);
  const pos = await playerCell(wallet).catch(() => null);
  if (!pos) throw new Error("artfix.far");
  try {
    requireAdjacent(pos, q, r);
  } catch {
    throw new Error("artfix.far");
  }
  await requireNotVoid(wallet, mapId, q, r);
  const b = await loadCellBuilding(mapId, q, r);
  if (b?.buildingId !== FORGE_TEMPLATE_ID) throw new Error("artfix.no_forge");
}

/** Выполнить вызов и достать jsonb-итог. Пустой ответ — сбой, а не «ничего». */
async function callRepair(sql: string): Promise<RepairResult> {
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ r?: unknown }> | null;
  let r: unknown = rows?.[0]?.r;
  if (typeof r === "string") r = JSON.parse(r) as unknown;
  if (!r || typeof r !== "object") throw new Error("artfix.failed");
  return r as RepairResult;
}

export const getArtRepairList = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: ArtRepairItem[] }> => {
    const { account } = await requireArtRepair();
    return { items: await repairListFor(account) };
  },
);

const OP_RE = /^[A-Za-z0-9_-]{8,64}$/;
const amount = z.number().int().min(0).max(1_000_000_000);

export const repairInput = z
  .object({
    q: z.number().int(),
    r: z.number().int(),
    /** Выбранные артефакты; при all — не нужны. */
    ids: z.array(z.string().min(1).max(64)).max(REPAIR_LIST_LIMIT).default([]),
    /** «Починить все»: все изношенные артефакты аккаунта на момент нажатия. */
    all: z.boolean().default(false),
    /** Сумма, которую видел игрок: база сверит со своей и откажет, если разошлось. */
    expectGold: amount,
    expectDiamonds: amount,
    opId: z.string().regex(OP_RE),
  })
  .refine((d) => d.all || d.ids.length > 0, { message: "artfix.nothing" });

export type RepairInput = z.infer<typeof repairInput>;

/** Починка от имени аккаунта — общая для ручки и тестов. */
export async function repairAs(
  wallet: string,
  account: string,
  data: RepairInput,
): Promise<ArtRepairDone> {
  await actionGate("art-repair", wallet);
  await requireAtForge(wallet, data.q, data.r);
  let res: RepairResult;
  try {
    res = await callRepair(
      repairCallSql({
        op: data.opId,
        account,
        ids: data.all ? [] : data.ids,
        all: data.all,
        expectGold: data.expectGold,
        expectDiamonds: data.expectDiamonds,
      }),
    );
  } catch (e) {
    throw new Error(repairDbError(e));
  }
  if (!res.ok) throw new Error(repairRefusal(res));
  // Сломанный снова целый: со штрафом за поломку (BROKEN_ART_PENALTY) сила героя
  // меняется — кэш силы сбрасываем; пока штрафа нет, сброс лишний, но безвреден.
  if (res.fresh !== false) {
    const { invalidateHeroPower } = await import("@/server/api/beta-raid/hero-power");
    invalidateHeroPower(wallet);
  }
  return repairDoneOf(res);
}

export const repairArtifacts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => repairInput.parse(d))
  .handler(async ({ data }): Promise<ArtRepairDone> => {
    const { wallet, account } = await requireArtRepair();
    return repairAs(wallet, account, data);
  });
