// Круги NFT в базе: открыть на выезде, закрыть на вводе, прочитать для списков.
//
// Смысл и правило — в src/lib/nftCycle.ts. Здесь только хранение и атомарность.
// Таблица yuplink.nft_token_cycle; перевод закрывает круг один раз — уникальный
// индекс (contract, token_id, close_tx). Решение и запись — одним запросом под
// замком по номеру, чтобы кнопка «Ввести» и догон не зачли одно и то же дважды.
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import type { CycleBinding, CycleRow } from "@/lib/nftCycle";
import { iso, toCycle, type DbRow } from "./nft-cycle-row";
export { stableId, ownChipId, parseCur, toCycle } from "./nft-cycle-row";

const T = "yuplink.nft_token_cycle";
const CHUNK = 300;

const COLS = `id, token_id, opened_at, open_source, closed_at, close_tx, chip_id,
              serial_no, template_id, level, collection_id, grant_ids`;

/** Все круги по списку номеров одного контракта — один запрос на пачку. */
export async function loadCycles(
  contract: string,
  tokenIds: string[],
): Promise<Map<string, CycleRow[]>> {
  const out = new Map<string, CycleRow[]>();
  const uniq = Array.from(new Set(tokenIds.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const list = uniq.slice(i, i + CHUNK).map(sqlStr).join(",");
    const rows = (await mcpExec(
      `SELECT ${COLS} FROM ${T} WHERE contract = ${sqlStr(contract)} AND token_id IN (${list});`,
      { wrapJson: true },
    )) as DbRow[];
    for (const r of rows ?? []) {
      const key = String(r.token_id);
      const arr = out.get(key) ?? [];
      arr.push(toCycle(r));
      out.set(key, arr);
    }
  }
  return out;
}

/**
 * Номер уехал со склада — открыть круг. Вывод фишки несёт привязку: какой номер
 * и какая фишка вернутся за эту NFT. Повтор того же перевода (реконсиляция
 * добивает вывод) второго круга не заводит — ключ по open_tx.
 */
export async function openCycle(o: {
  contract: string;
  tokenId: string;
  source: "mint" | "prize";
  by: string;
  tx?: string | null;
  binding?: CycleBinding | null;
  /**
   * Момент выезда — ДО отправки (мс). Пока номер на складе, ввести его никто не
   * может, поэтому раннее время безопасно; позднее (запись реконсиляцией через
   * часы) приклеило бы перевод нового владельца к прошлому кругу.
   */
  atMs?: number;
}): Promise<void> {
  const b = o.binding ?? null;
  const opened = o.atMs != null && Number.isFinite(o.atMs)
    ? `${sqlStr(iso(o.atMs))}::timestamptz`
    : "now()";
  await mcpExec(
    `INSERT INTO ${T} (id, contract, token_id, opened_at, open_source, opened_by, open_tx,
                       chip_id, serial_no, template_id, level, collection_id)
     VALUES (${sqlStr(`ncy_${nanoid(12)}`)}, ${sqlStr(o.contract)}, ${sqlStr(o.tokenId)}, ${opened},
             ${sqlStr(o.source)}, ${sqlStr(o.by)}, ${o.tx ? sqlStr(o.tx) : "NULL"},
             ${b?.chipId ? sqlStr(b.chipId) : "NULL"}, ${b?.serial == null ? "NULL" : Number(b.serial)},
             ${b ? sqlStr(b.templateId) : "NULL"}, ${b ? Number(b.level) : "NULL"},
             ${b ? sqlStr(b.collectionId) : "NULL"})
     ON CONFLICT DO NOTHING;`,
  );
}

// Решение и запись по переводу — в nft-cycle-claim.ts (лимит 250 строк).
export { claimCredit, type CreditClaim } from "./nft-cycle-claim";
import type { CreditClaim } from "./nft-cycle-claim";

/** Круг, уже закрытый этим переводом (доделка прерванной выдачи), — его id. */
export async function cycleClosedBy(
  contract: string,
  tokenId: string,
  txHash: string,
): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT id FROM ${T} WHERE contract = ${sqlStr(contract)} AND token_id = ${sqlStr(tokenId)}
        AND close_tx = ${sqlStr(txHash)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return rows?.[0]?.id ?? null;
}

/** Записать, что выдано за закрытый круг. */
export async function finishCredit(
  cycleId: string,
  txHash: string,
  g: { kind: "chip" | "pack"; ids: string[]; issuedSerial?: number | null },
): Promise<void> {
  const rows = (await mcpExec(
    `UPDATE ${T} SET grant_kind = ${sqlStr(g.kind)},
            grant_ids = ${sqlStr(JSON.stringify(g.ids))}::jsonb,
            issued_serial = ${g.issuedSerial == null ? "NULL" : Number(g.issuedSerial)},
            updated_at = now()
      WHERE id = ${sqlStr(cycleId)} AND close_tx = ${sqlStr(txHash)}
      RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  // Выдача уже у игрока, а круг не записал её — громко: такое ищут глазами.
  if (!rows || rows.length === 0) {
    console.error(`[nft-cycle] выдача ${g.ids.join(",")} не записалась в круг ${cycleId} (tx ${txHash})`);
  }
}

/**
 * Выдача сорвалась — вернуть круг как был, иначе NFT осталась бы «зачтённой»
 * без награды. Снимаем только своё: по id и по переводу.
 */
export async function releaseCredit(
  claim: Extract<CreditClaim, { kind: "claimed" }>,
  txHash: string,
): Promise<void> {
  const where = `id = ${sqlStr(claim.cycleId)} AND close_tx = ${sqlStr(txHash)} AND grant_ids IS NULL`;
  await mcpExec(
    claim.implicit
      ? `DELETE FROM ${T} WHERE ${where};`
      : `UPDATE ${T} SET closed_at = NULL, closed_by = NULL, close_tx = NULL, close_source = NULL,
                         updated_at = now() WHERE ${where};`,
  );
}
