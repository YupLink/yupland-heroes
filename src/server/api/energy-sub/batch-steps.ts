// Шаги пачки: обмен на Ref, зачёт в пул карты, переводы в дупло и
// разработчикам. Каждый шаг пишется в money_batch.steps.
//
// ГЛАВНОЕ ПРАВИЛО: перевод не отправляется дважды. Шаг «sending» пишется
// ПОСЛЕ подписи и ДО отправки — с хэшем, nonce и подписанными байтами; после —
// «done». Упал сервер или сеть между отправкой и ответом — шаг «sending» НЕ
// переотправляется вслепую: batch-heal.ts сам смотрит сеть (нашлась —
// «done», точно не пройдёт — «retry»), без этих данных — владелец отмечает шаг
// руками (batch-resolve.ts).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type Step = {
  name: "swap" | "map" | "burn" | "burnpool" | "dev" | "bank";
  state: "sending" | "done" | "retry";
  hash?: string;
  hashes?: string[];
  amount?: number;
  received?: number;
  /** Номер транзакции у ключа и подписанные байты (base64) — для автоматического разбора. */
  nonce?: string;
  tx?: string;
  at: string;
};

export const BURN_WALLET = "darai_duplo.near";
export const DARAI_FT = { ftContract: "darai.tkn.near", decimals: 18 };
export const USDT_FT = { ftContract: "usdt.tether-token.near", decimals: 6 };

export function stepOf(steps: Step[], name: Step["name"]): Step | undefined {
  // Последняя запись шага главнее: «sending», потом «done» или «retry».
  return [...steps].reverse().find((s) => s.name === name);
}

export async function pushStep(batchId: string, step: Omit<Step, "at">): Promise<void> {
  const s: Step = { ...step, at: new Date().toISOString() };
  await mcpExec(
    `UPDATE yuplink.money_batch
        SET steps = steps || ${sqlStr(JSON.stringify([s]))}::jsonb, updated_at = now()
      WHERE id = ${sqlStr(batchId)};`,
  );
}

/** Пометка «sending» перед отправкой: не записалась — транзакция не уходит. */
export async function pushSendingStep(batchId: string, step: Omit<Step, "at" | "state">): Promise<void> {
  const s: Step = { ...step, state: "sending", at: new Date().toISOString() };
  const rows = (await mcpExec(
    `UPDATE yuplink.money_batch
        SET steps = steps || ${sqlStr(JSON.stringify([s]))}::jsonb, updated_at = now()
      WHERE id = ${sqlStr(batchId)}
      RETURNING id;`,
  )) as unknown[] | null;
  if (!rows?.length) throw new Error(`Пачка ${batchId}: пометка «отправляется» не записалась`);
}

export async function setStatus(
  batchId: string,
  status: "running" | "done" | "failed" | "closed",
  error: string | null = null,
): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.money_batch
        SET status = ${sqlStr(status)}, error = ${error ? sqlStr(error.slice(0, 500)) : "NULL"},
            updated_at = now()
      WHERE id = ${sqlStr(batchId)};`,
  );
}

/** Хватает ли токена на операционном кошельке — перевод без денег не шлём. */
async function assertBalance(ft: { ftContract: string; decimals: number }, amount: number) {
  const { getOperatingBalanceRaw, humanToRaw, invalidateBalanceCache } = await import("../../near");
  invalidateBalanceCache(ft.ftContract);
  const have = BigInt(await getOperatingBalanceRaw(ft.ftContract));
  if (have < humanToRaw(amount, ft.decimals)) {
    throw new Error(`На кошельке не хватает ${ft.ftContract} для перевода ${amount}`);
  }
}

/** Шаг «sending» без ответа: с подписанными байтами разберётся batch-heal, без них — владелец. */
function unknownOutcome(name: Step["name"], prev: Step): Error {
  return new Error(
    prev.tx
      ? `Шаг «${name}»: исход перевода неизвестен — сверю с сетью сам`
      : `Шаг «${name}»: исход перевода неизвестен — проверь кошелёк и отметь шаг`,
  );
}

/**
 * Перевод одной транзакцией (все получатели одним куском): «sending» с хэшем,
 * nonce и байтами — после подписи, до отправки. Сбой до подписи — шага нет.
 */
async function transferStep(
  batchId: string,
  name: "burn" | "dev",
  ft: { ftContract: string; decimals: number },
  items: Array<{ receiverId: string; amountHuman: number }>,
  amount: number,
): Promise<string[]> {
  const { ftTransferBatched, BATCH_CHUNK_PAIRS } = await import("../../near");
  if (items.length > BATCH_CHUNK_PAIRS) {
    throw new Error(`Шаг «${name}»: получателей больше ${BATCH_CHUNK_PAIRS} — одной транзакцией не уйдёт`);
  }
  const res = await ftTransferBatched({
    ...ft,
    items,
    onSigned: (hash, m) => pushSendingStep(batchId, { name, amount, hash, nonce: m.nonce, tx: m.signedTx }),
  });
  if (res.failed.length > 0) {
    // failed — куски транзакций, а не получатели: называем кошельки и причину.
    const who = res.failed.flatMap((f) => f.receivers).join(", ");
    const why = res.failed.map((f) => f.error + (f.txHash ? ` (tx ${f.txHash})` : "")).join("; ");
    throw new Error(`Шаг «${name}»: перевод не подтвердился — ${who}: ${why}`);
  }
  return res.txHashes;
}

/** Перевод одному получателю — ровно один раз. */
export async function sendOnce(
  batchId: string,
  steps: Step[],
  name: "burn",
  ft: { ftContract: string; decimals: number },
  receiverId: string,
  amount: number,
): Promise<void> {
  const prev = stepOf(steps, name);
  if (prev?.state === "done") return;
  if (prev?.state === "sending") throw unknownOutcome(name, prev);
  if (!(amount > 0)) return;
  await assertBalance(ft, amount);
  const hashes = await transferStep(batchId, name, ft, [{ receiverId, amountHuman: amount }], amount);
  await pushStep(batchId, { name, state: "done", amount, hash: hashes[0] });
}

/** Доли разработчиков до 6 знаков; остаток округления — последнему, сумма ровно amount. */
export function devItems(wallets: Array<{ wallet: string; share: number }>, amount: number) {
  // Кошельки по умолчанию — из env (server/team): не задан — не платим никуда.
  if (!wallets.length || wallets.some((w) => !w.wallet.trim())) {
    throw new Error(
      "Кошелёк разработчика не задан (TEAM_OWNER_WALLET / TEAM_PARTNER_WALLET) — перевод остановлен",
    );
  }
  const floor6 = (n: number) => Math.floor(n * 1e6 + 1e-6) / 1e6;
  const items = wallets.map((w) => ({ receiverId: w.wallet, amountHuman: floor6(amount * w.share) }));
  const rest = items.slice(0, -1).reduce((s, i) => s + i.amountHuman, 0);
  if (items.length) items[items.length - 1].amountHuman = floor6(amount - rest);
  return items;
}

/** Перевод разработчикам по долям — ровно один раз (все доли одной транзакцией). */
export async function sendDevOnce(
  batchId: string,
  steps: Step[],
  ft: { ftContract: string; decimals: number },
  wallets: Array<{ wallet: string; share: number }>,
  amount: number,
): Promise<void> {
  const prev = stepOf(steps, "dev");
  if (prev?.state === "done") return;
  if (prev?.state === "sending") throw unknownOutcome("dev", prev);
  if (!(amount > 0)) return;
  await assertBalance(ft, amount);
  const hashes = await transferStep(batchId, "dev", ft, devItems(wallets, amount), amount);
  await pushStep(batchId, { name: "dev", state: "done", amount, hashes });
}

const BUCKET_NAME: Record<string, string> = {
  sub_usd_map: "$ → карта",
  bank_usd: "$ → откуп золота",
  sub_usd: "корзина $",
  sub_burn: "сжечь DARAI",
  sub_dev: "разработчикам DARAI",
  auc_darai: "аукционы админа · DARAI",
  auc_usd: "аукционы админа · USDT",
};

/**
 * Итог пачки для бота человеческим языком: сколько обменяно, сколько DARAI
 * пришло и куда что легло — по сделанным шагам, а не по плану.
 */
export function batchSummary(bucket: string, amount: number, steps: Step[]): string {
  const n = (v: number | undefined) => Number(v ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const done = (name: Step["name"]) => {
    const s = stepOf(steps, name);
    return s?.state === "done" ? s : undefined;
  };
  const usd = bucket === "sub_usd" || bucket === "sub_usd_map" || bucket === "auc_usd";
  const parts: string[] = [];
  const swap = done("swap");
  if (swap) parts.push(`обмен ${n(swap.amount)} USDT → ${n(swap.received)} DARAI`);
  const map = done("map");
  if (map) parts.push(`в пул карты ${n(map.amount)} DARAI`);
  const burn = done("burn");
  if (burn) parts.push(`в дупло ${n(burn.amount)} DARAI`);
  const pool = done("burnpool");
  if (pool) parts.push(`в пул сжигания ${n(pool.amount)} DARAI`);
  const dev = done("dev");
  if (dev) parts.push(`разработчикам ${n(dev.amount)} ${usd ? "USDT" : "DARAI"}`);
  if (parts.length === 0) parts.push(`${n(amount)} ${usd ? "USDT" : "DARAI"}`);
  return `${BUCKET_NAME[bucket] ?? bucket}: ${parts.join(" · ")}`;
}
