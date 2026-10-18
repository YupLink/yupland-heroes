// Выдача за перевод NFT на склад — одна на все пути: кнопка «Ввести», ввод
// пачкой и догон. Решает круг (nft-cycle.ts), здесь — сама выдача.
//
// Порядок важен: круг закрывается (это замок от двойной выдачи), кладётся
// награда, круг запоминает, что выдано. Сбой посередине круг НЕ откатывает:
// повтор (кнопка, догон) видит «закрыт этим переводом, выдачи нет» и доделывает
// её теми же id — фишка и боксы выводятся из круга и перевода, поэтому второй
// раз не лягут. Откат был хуже: вставка могла пройти, а ответ потеряться, и
// выдача оставалась непривязанной — страховка потом принимала её за выдачу мимо
// кругов и отбирала у старших переводов номера. Откатывается только «нет
// связки» — там ничего не записано.
import { mcpExec } from "../db/mcpClient";
import { chipRestUntil } from "../chipRest";
import { sqlStr } from "./chips-utils";
import {
  claimCredit,
  cycleClosedBy,
  finishCredit,
  ownChipId,
  releaseCredit,
  type CreditClaim,
} from "./nft-cycle";
import { legacyCredited, legacyKey } from "./nft-cycle-legacy";
import { serialForCycle, bindSerialToNft } from "./chips-deposit-serial";
import { grantPacks } from "./chips-mint-deposit-grant";
import { beforeCycles, type CycleBinding } from "@/lib/nftCycle";

export type ChipIdentity = { templateId: string; level: number; collectionId: string };

export type CreditOutcome<G> =
  | ({ kind: "granted"; cycleId: string } & G)
  | { kind: "already"; cycleId: string }
  /** Выдано вне кругов — прежним кодом или вручную (см. nft-cycle-legacy.ts). */
  | { kind: "legacy" }
  /** Перевод старше учёта кругами, и круги его не знают — разбор руками. */
  | { kind: "old" }
  | { kind: "stale"; cycleId: string }
  | { kind: "none"; reason: string };

export type Transfer = {
  wallet: string;
  contract: string;
  tokenId: string;
  txHash: string;
  /** Время перевода в сети — по нему перевод находит свой круг. */
  atMs: number;
  /** Кто зачитывает: deposit | deposit_batch | recover | manual_fix. */
  source: string;
};

/** Какая фишка вернулась — для ответа игроку и журнала. */
export type ChipGrant = {
  chipId: string;
  identity: ChipIdentity;
  serial: number;
  /** Номер тот же, под которым фишку выводили. */
  ownSerial: boolean;
};

/** Причина для журнала и экранов: перевод старше кругов. «старее эпохи» считает крон. */
export const OLD_TRANSFER_NOTE = "перевод старее эпохи кругов — разобрать руками";

type Claimed = Extract<CreditClaim, { kind: "claimed" }>;

async function claimOrOutcome<G>(t: Transfer): Promise<{ claim: Claimed } | { out: CreditOutcome<G> }> {
  // Страховка — ДО закрытия круга и только чтением, для доделки тоже. Иначе два
  // одинаковых запроса проскакивали: первый закрывал круг и откатывал его по
  // страховке, второй успевал «доделать» выдачу мимо неё. Своя недоделанная
  // выдача узнаётся по выведенному id и за чужую не считается.
  const mine = await cycleClosedBy(t.contract, t.tokenId, t.txHash);
  const legacy = await legacyCredited([
    { ...t, ownCycleId: mine, ownChipId: mine ? await ownChipId(mine, t.txHash) : null },
  ]);
  if (legacy.has(legacyKey(t))) return { out: { kind: "legacy" } };
  // Перевод старше кругов, которого круги не знают, сами не зачитываем.
  if (!mine && beforeCycles(t.atMs)) return { out: { kind: "old" } };

  const claim = await claimCredit(t);
  if (claim.kind === "already") return { out: { kind: "already", cycleId: claim.cycleId } };
  if (claim.kind === "stale") return { out: { kind: "stale", cycleId: claim.cycleId } };
  return { claim };
}

/**
 * Фишка за перевод. Вид фишки — из привязки круга (это её же выведенная
 * фишка), а если привязки нет — по названию NFT (byTitle).
 */
export async function creditChip(
  t: Transfer,
  byTitle: () => Promise<ChipIdentity | null>,
): Promise<CreditOutcome<ChipGrant>> {
  const got = await claimOrOutcome<ChipGrant>(t);
  if ("out" in got) return got.out;
  const { claim } = got;
  const binding: CycleBinding | null = claim.binding;
  const identity: ChipIdentity | null = binding
    ? { templateId: binding.templateId, level: binding.level, collectionId: binding.collectionId }
    : await byTitle();
  if (!identity) {
    await releaseCredit(claim, t.txHash);
    return { kind: "none", reason: "нет связки NFT с фишкой" };
  }
  // Id фишки выводится из круга и перевода: повтор выдачи находит уже
  // положенную фишку, а не кладёт вторую.
  const chipId = await ownChipId(claim.cycleId, t.txHash);
  const serialOf = async (): Promise<number | null> => {
    const rows = (await mcpExec(
      `SELECT serial_no FROM yuplink.user_chip_inventory WHERE id = ${sqlStr(chipId)};`,
      { wrapJson: true },
    )) as Array<{ serial_no: number | null }>;
    return rows?.[0]?.serial_no == null ? null : Number(rows[0].serial_no);
  };
  const had = await serialOf();
  const picked =
    had != null
      ? { serial: had }
      : await serialForCycle({
          binding,
          contract: t.contract,
          tokenId: t.tokenId,
          collectionId: identity.collectionId,
        });
  const now = new Date().toISOString();
  await mcpExec(
    `INSERT INTO yuplink.user_chip_inventory
       (id, wallet, collection_id, template_id, level, source, source_grant_id,
        status, obtained_at, updated_at, serial_no, rest_until)
     VALUES (${sqlStr(chipId)}, ${sqlStr(t.wallet)}, ${sqlStr(identity.collectionId)},
             ${sqlStr(identity.templateId)}, ${Number(identity.level)}, 'nft_input',
             ${sqlStr(`nftdep:${t.tokenId}`)}, 'owned', ${sqlStr(now)}::timestamptz,
             ${sqlStr(now)}::timestamptz, ${picked.serial}, ${sqlStr(chipRestUntil())}::timestamptz)
     ON CONFLICT (id) DO NOTHING;`,
  );
  // Номер — тот, что реально лёг: при гонке двух доделок кладёт один из них.
  const serial = (await serialOf()) ?? picked.serial;
  // Запись чеканки — для статистики «сколько фишек в NFT»: фишка дома.
  await mcpExec(
    `UPDATE yuplink.chip_nft_mints SET returned_at = now(), returned_to = ${sqlStr(t.wallet)}
      WHERE contract = ${sqlStr(t.contract)} AND token_id = ${sqlStr(t.tokenId)};`,
  ).catch(() => {});
  // NFT со стороны: её номер закрепляем на будущее — вернётся с ним же.
  if (!binding) {
    await bindSerialToNft({
      contract: t.contract,
      tokenId: t.tokenId,
      collectionId: identity.collectionId,
      templateId: identity.templateId,
      level: identity.level,
      serialNo: serial,
      wallet: t.wallet,
    });
  }
  await finishCredit(claim.cycleId, t.txHash, { kind: "chip", ids: [chipId], issuedSerial: serial });
  return {
    kind: "granted",
    cycleId: claim.cycleId,
    chipId,
    identity,
    serial,
    ownSerial: binding?.serial === serial,
  };
}

/** Боксы за перевод пак-NFT. Ключ гранта несёт круг — следующий круг получит свои. */
export async function creditPacks(
  t: Transfer,
  pack: { packId: string; count: number },
): Promise<CreditOutcome<{ grantIds: string[] }>> {
  const got = await claimOrOutcome<{ grantIds: string[] }>(t);
  if ("out" in got) return got.out;
  const { claim } = got;
  const grantIds = await grantPacks({
    wallet: t.wallet,
    packId: pack.packId,
    contract: t.contract,
    tokenId: t.tokenId,
    count: pack.count,
    cycleId: claim.cycleId,
  });
  await finishCredit(claim.cycleId, t.txHash, { kind: "pack", ids: grantIds });
  return { kind: "granted", cycleId: claim.cycleId, grantIds };
}
