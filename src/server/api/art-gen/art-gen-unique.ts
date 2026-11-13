// «Сделать уникальным» (§8.122): арт генератора больше никому не выпадает
// (crafted-sql.droppable) — пока ни одной копии шаблона нигде нет (copiesSql).
// Цена — из настройки ТОГО генератора, где арт заказан, и только у него.
//
// Каждая попытка — своя плата (ключ шаблона + попытки, его создаёт сервер):
// повтор после возврата платит заново, а не проходит по старому ключу. Отметка
// — одним оператором с условием «копий нет» и меткой попытки (повтор моста
// узнаёт свою отметку). Отметила не эта попытка — её плата назад.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";
import { craftItemId } from "@/server/api/craft/lab-finish";
import { genAt } from "./art-gen-order";
import { genUniqueRef } from "./art-gen-sql";
import { copiesSql, loadGenJob, type GenJobView } from "./art-gen-view";

const PAY = { kind: "artgen_unique", refundKind: "artgen_unique_refund", keyed: true } as const;

/**
 * Отметить шаблон уникальным, если копий нет и сам арт лежит у этого аккаунта
 * (владелец 08.11: «сделать уникальным можно только свой арт»); метка попытки —
 * для повтора моста.
 */
export function markUniqueSql(
  templateId: string,
  jobId: string,
  ref: string,
  account: string,
): string {
  const tpl = sqlStr(templateId);
  const mark = sqlStr(ref);
  return `UPDATE yuplink.mystic_item_template t
             SET meta = t.meta || jsonb_build_object('unique', true, 'unique_ref', ${mark})
           WHERE t.id = ${tpl} AND t.meta->>'crafted' = 'gen'
             AND (coalesce(t.meta->>'unique', '') <> 'true' OR t.meta->>'unique_ref' = ${mark})
             AND NOT ${copiesSql(tpl, sqlStr(craftItemId(jobId)))}
             AND EXISTS (SELECT 1 FROM yuplink.user_game_item o
                          WHERE o.id = ${sqlStr(craftItemId(jobId))} AND o.account_id = ${sqlStr(account)})
          RETURNING t.id;`;
}

export async function makeGenUnique(
  wallet: string,
  d: { q: number; r: number; id: string },
): Promise<GenJobView> {
  const account = await raidOwner(wallet);
  const job = await loadGenJob(account, d.id);
  if (!job || job.status !== "done" || !job.templateId) throw new Error("artgen.not_found");
  if (job.unique) return job;
  if (job.copied) throw new Error("artgen.unique_late");
  if (!job.owned) throw new Error("artgen.not_owned");
  // Только у генератора, где арт заказан.
  if (job.q !== d.q || job.r !== d.r) throw new Error("artgen.unique_other");
  const { mapId, cfg } = await genAt(wallet, d.q, d.r);
  if (job.mapId !== mapId) throw new Error("artgen.unique_other");
  if (!cfg.unique.length) throw new Error("artgen.no_unique_price");
  const ref = genUniqueRef(job.templateId, nanoid(12));
  await payResources(wallet, cfg.unique, ref, PAY);
  const rows = (await mcpExec(markUniqueSql(job.templateId, job.id, ref, account), {
    wrapJsonCte: true,
  })) as Array<{ id: string }> | null;
  if (!rows?.[0]?.id) {
    await refundResources(wallet, cfg.unique, ref, PAY);
    const now = await loadGenJob(account, d.id);
    if (now?.unique) return now;
    throw new Error("artgen.unique_late");
  }
  const { invalidateAliases } = await import("@/server/api/beta-raid/item-alias");
  invalidateAliases();
  return (await loadGenJob(account, d.id)) ?? { ...job, unique: true };
}
