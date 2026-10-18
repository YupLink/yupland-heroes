// Страховка от выдач, сделанных мимо кругов.
//
// Круги учат только то, что записано в них. Переводы, которые зачёл прежний код
// (в том числе в окне между переносом истории и выкатом), ручные скрипты
// выдачи и старые вводы без хэша перевода круги могут принять за незачтённые.
// Признак выдачи тогда один — сама выдача: фишка `nftdep:{token}` или бокс за
// этот номер, выданные НЕ РАНЬШЕ перевода (минута форы на разницу часов сети и
// базы) и НЕ записанные ни в один круг этого номера. Такой перевод считаем
// зачтённым, как бы ни выглядели круги.
//
// Выдачи кругов с ИЗВЕСТНЫМ переводом (close_tx) сюда не попадают: их стережёт
// сам круг, а в страховке они отбирали бы честные вводы (быстрый возврат того же
// номера после выдачи за другой перевод). Выдачи кругов переноса без хэша —
// попадают: какой перевод они закрыли, неизвестно, и повтор настоящего перевода
// иначе получил бы вторую выдачу. Своя недоделанная выдача (id выведен из круга
// и перевода) — тоже не «чужая»: её доделывают, а не отказывают.
//
// Обратная сторона — старший незачтённый перевод при более поздней выдаче мимо
// кругов сам не зачтётся: разбор руками. Потерять такой перевод лучше, чем
// выдать вдвое.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

const GRACE_MS = 60_000;
const CHUNK = 200;

export type LegacyKey = {
  contract: string;
  tokenId: string;
  atMs: number;
  /** Круг, уже закрытый ЭТИМ переводом (доделка), — его выдачи свои. */
  ownCycleId?: string | null;
  /** Id своей фишки для этого круга и перевода. */
  ownChipId?: string | null;
};
export const legacyKey = (k: { contract: string; tokenId: string; atMs: number }): string =>
  `${k.contract}|${k.tokenId}|${k.atMs}`;

/** Какие из переводов уже закрыты выдачей мимо кругов, сделанной не раньше них. */
export async function legacyCredited(items: LegacyKey[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < items.length; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    if (part.length === 0) continue;
    const values = part
      .map(
        (k) =>
          `(${sqlStr(k.contract)}, ${sqlStr(k.tokenId)},
            ${sqlStr(new Date(k.atMs - GRACE_MS).toISOString())}::timestamptz, ${Number(k.atMs)}::bigint,
            ${k.ownChipId ? sqlStr(k.ownChipId) : "NULL"}::text,
            ${k.ownCycleId ? sqlStr(`~${k.ownCycleId}`) : "NULL"}::text)`,
      )
      .join(",");
    const rows = (await mcpExec(
      `WITH t(contract, tok, since, at_ms, own_chip, own_ref) AS (VALUES ${values}),
       linked AS (
         SELECT c.contract, c.token_id, jsonb_array_elements_text(c.grant_ids) AS gid
           FROM yuplink.nft_token_cycle c
           JOIN (SELECT DISTINCT tok FROM t) tt ON tt.tok = c.token_id
          WHERE c.grant_ids IS NOT NULL AND c.close_tx IS NOT NULL)
       SELECT t.contract, t.tok, t.at_ms FROM t
        WHERE EXISTS (SELECT 1 FROM yuplink.user_chip_inventory i
                       WHERE i.source = 'nft_input' AND i.source_grant_id = 'nftdep:' || t.tok
                         AND i.obtained_at >= t.since
                         AND i.id IS DISTINCT FROM t.own_chip
                         AND i.id NOT IN (SELECT gid FROM linked l WHERE l.token_id = t.tok))
           OR EXISTS (SELECT 1 FROM yuplink.chip_pack_grants g
                       WHERE g.source = 'nft_input'
                         AND split_part(g.source_ref, '#', 1) = t.contract || ':' || t.tok
                         AND g.granted_at >= t.since
                         AND (t.own_ref IS NULL
                              OR right(g.source_ref, length(t.own_ref)) <> t.own_ref)
                         AND g.id NOT IN (SELECT gid FROM linked l
                                           WHERE l.contract = t.contract AND l.token_id = t.tok));`,
      { wrapJson: true },
    )) as Array<{ contract: string; tok: string; at_ms: number | string }>;
    for (const r of rows ?? []) {
      out.add(legacyKey({ contract: r.contract, tokenId: String(r.tok), atMs: Number(r.at_ms) }));
    }
  }
  return out;
}
