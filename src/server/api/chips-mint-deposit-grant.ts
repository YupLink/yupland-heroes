// Выдача боксов за принятую NFT — общая часть одиночного и batch-ввода.
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/**
 * Ключ гранта за токен: у мистик-пака боксов несколько — суффикс #N.
 *
 * С кругами NFT ключ несёт и круг (`~круг`): склад переиспользует номера, и
 * один и тот же пак-токен законно вводится снова — уже в другом круге. Прежний
 * ключ без круга был уникален на номер навсегда и отбивал второй ввод «бокс
 * уже выдан». Основа ключа (до '#') прежняя — `contract:token`, по ней ищут
 * выдачи сверки и индекс cpg_nft_input_base_ref_idx.
 */
function grantRef(
  contract: string,
  tokenId: string,
  count: number,
  i: number,
  cycleId?: string,
): string {
  if (cycleId) return `${contract}:${tokenId}#${i + 1}~${cycleId}`;
  return `${contract}:${tokenId}${count > 1 ? `#${i + 1}` : ""}`;
}

/**
 * Выдать N боксов за одну NFT: у мистик-пака их несколько, у обычного один.
 *
 * ОДНИМ запросом и идемпотентно. Было — цикл из N отдельных вставок: на
 * мистик-боксе «20 штук» частичный сбой оставлял игроку k из 20 без шанса
 * дожать, а повтор запроса транспортом (mcpClient ретраит при обрыве) плодил
 * дубли — настоящего ключа у гранта в БД не было. Теперь ключ `source_ref`
 * закрыт уникальным индексом, а id уже выданных боксов дочитываются: сколько
 * раз ни повтори, у игрока ровно N боксов и те же самые.
 */
export async function grantPacks(opts: {
  wallet: string;
  packId: string;
  contract: string;
  tokenId: string;
  count: number;
  /** Круг NFT, за который выдаём (см. grantRef). */
  cycleId?: string;
}): Promise<string[]> {
  const count = Math.max(1, opts.count);
  const nowIso = new Date().toISOString();
  const refs: string[] = [];
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    const ref = grantRef(opts.contract, opts.tokenId, count, i, opts.cycleId);
    refs.push(ref);
    values.push(
      `(${sqlStr(`cpg_${nanoid(10)}`)}, ${sqlStr(opts.wallet)}, ${sqlStr(opts.packId)},
        'nft_input', ${sqlStr(ref)}, ${sqlStr(nowIso)}::timestamptz, NULL, NULL, 0)`,
    );
  }
  await mcpExec(
    `INSERT INTO yuplink.chip_pack_grants
       (id, wallet, chip_pack_id, source, source_ref, granted_at, opened_at, result_chips, tickets_spent)
     VALUES ${values.join(",")}
     ON CONFLICT (source_ref) WHERE source = 'nft_input' DO NOTHING;`,
  );
  // Читаем факт, а не то, что собирались вставить: при повторе вставка
  // ничего не делает, а вернуть игроку надо id уже существующих боксов.
  const rows = (await mcpExec(
    `SELECT id, source_ref FROM yuplink.chip_pack_grants
      WHERE source = 'nft_input' AND source_ref IN (${refs.map(sqlStr).join(",")});`,
    { wrapJson: true },
  )) as Array<{ id: string; source_ref: string }>;
  const byRef = new Map(rows.map((r) => [r.source_ref, r.id]));
  const ids = refs.map((r) => byRef.get(r)).filter((v): v is string => !!v);
  if (ids.length < count) {
    throw new Error(`Выдано ${ids.length} боксов из ${count} — часть не записалась`);
  }
  return ids;
}
