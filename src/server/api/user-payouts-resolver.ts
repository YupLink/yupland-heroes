import { nanoid } from "nanoid";
import { pg, type PgRedemption } from "../db/pg";

type TxStatus = "success" | "failure" | "missing" | "pending";

let _lastResolveAt = 0;

export async function resolveStuckProcessing(): Promise<void> {
  const now = Date.now();
  if (now - _lastResolveAt < 5_000) return;
  _lastResolveAt = now;

  const cutoff = new Date(now - 15_000).toISOString();
  const { data: rows, error } = await pg.redemptions
    .raw()
    .select(
      "id, wallet, amount, processing_tx_hash, processing_started_at, processing_orig_amount, reward_token, ft_contract, decimals, campaign_id, contract_id, token_id"
    )
    .eq("status", "processing")
    .not("processing_tx_hash", "is", null)
    .lt("processing_started_at", cutoff)
    .limit(50);
  if (error || !rows || rows.length === 0) return;

  const byHash = new Map<string, PgRedemption[]>();
  for (const r of rows as PgRedemption[]) {
    if (!r.processing_tx_hash) continue;
    const arr = byHash.get(r.processing_tx_hash) ?? [];
    arr.push(r);
    byHash.set(r.processing_tx_hash, arr);
  }

  let signer: string;
  try {
    const { getAdminAccountId } = await import("../nearSafe");
    signer = await getAdminAccountId();
  } catch {
    return;
  }

  let sendlerHashSet: Set<string> | null = null;
  try {
    const { fetchAdminFtTransferHistory } = await import("../sendler");
    const history = await fetchAdminFtTransferHistory({
      walletId: signer,
      direction: "out",
      limit: 200,
    });
    sendlerHashSet = new Set(history.map((h) => h.txHash));
  } catch (err) {
    console.warn(
      "[resolver] Sendler ft-transfers недоступен, fallback на RPC tx-status:",
      err instanceof Error ? err.message : err
    );
  }

  const hashes = Array.from(byHash.keys()).slice(0, 10);
  await Promise.all(
    hashes.map(async (hash) => {
      const group = byHash.get(hash)!;
      const ids = group.map((r) => r.id);

      let status: TxStatus;
      if (sendlerHashSet) {
        if (sendlerHashSet.has(hash)) {
          status = "success";
        } else {
          const startedAt = group[0].processing_started_at;
          const stale =
            startedAt &&
            now - new Date(startedAt).getTime() > 5 * 60_000;
          // «Не вижу в последних двухстах переводах» — это НЕ доказательство,
          // что перевода не было: активная выплата сплитами вытесняет свой же
          // хэш из окна индексера. Раньше на этом заявка возвращалась в
          // очередь, хотя деньги уже ушли, — и её выплачивали второй раз.
          // Разморозку теперь подтверждает сама сеть.
          if (stale) {
            const { checkTxStatus } = await import("../nearSafe");
            status = await checkTxStatus(hash, signer);
            // Sendler молчит, статус «в пути» — но если заявка висит дольше
            // получаса, спросим саму цепочку напрямую. Явное «tx не существует»
            // (не долетевший бродкаст) размораживает заявку; молчание узла —
            // нет, иначе выплатим второй раз по уже ушедшему переводу.
            if (status === "pending" && startedAt) {
              const veryStale = now - new Date(startedAt).getTime() > 30 * 60_000;
              if (veryStale) {
                const { txAbsentOnChain } = await import("../rpc");
                if (await txAbsentOnChain(hash, signer)) status = "missing";
              }
            }
          } else {
            status = "pending";
          }
        }
      } else {
        const { checkTxStatus } = await import("../nearSafe");
        status = await checkTxStatus(hash, signer);
      }

      if (status === "success") {
        for (const r of group) {
          await pg.redemptions
            .raw()
            .update({
              status: "paid",
              tx_hash: hash,
              processing_tx_hash: null,
              processing_started_at: null,
              processing_orig_amount: null,
            })
            .eq("id", r.id)
            .eq("status", "processing");
          if (
            r.processing_orig_amount != null &&
            r.processing_orig_amount > r.amount
          ) {
            const leftover = r.processing_orig_amount - r.amount;
            // Ключ от заявки, а не случайный: остаток по одной и той же
            // заявке вставляется ровно один раз, кто бы её ни закрыл —
            // резолвер или основной путь выплаты.
            await pg.redemptions
              .insert({
                id: `lft_${r.id}`,
                contract_id: r.contract_id,
                token_id: `${r.token_id}:leftover:${r.id}`,
                campaign_id: r.campaign_id,
                wallet: r.wallet,
                amount: leftover,
                status: "pending",
                reward_token: r.reward_token,
                ft_contract: r.ft_contract,
                decimals: r.decimals,
              })
              .catch((e: unknown) => {
                const m = e instanceof Error ? e.message : String(e);
                if (!/duplicate|unique/i.test(m)) throw e;
              });
          }
        }
        return;
      }

      if (status === "failure") {
        for (const r of group) {
          const restoreAmount =
            r.processing_orig_amount != null
              ? r.processing_orig_amount
              : r.amount;
          await pg.redemptions
            .raw()
            .update({
              status: "pending",
              amount: restoreAmount,
              processing_tx_hash: null,
              processing_started_at: null,
              processing_orig_amount: null,
            })
            .eq("id", r.id)
            .eq("status", "processing");
        }
        return;
      }

      if (status === "missing") {
        const startedAtRaw = group[0].processing_started_at;
        if (
          startedAtRaw &&
          now - new Date(startedAtRaw).getTime() > 5 * 60_000
        ) {
          for (const r of group) {
            const restoreAmount =
              r.processing_orig_amount != null
                ? r.processing_orig_amount
                : r.amount;
            await pg.redemptions
              .raw()
              .update({
                status: "pending",
                amount: restoreAmount,
                processing_tx_hash: null,
                processing_started_at: null,
                processing_orig_amount: null,
              })
              .eq("id", r.id)
              .eq("status", "processing");
          }
        }
        return;
      }
      void ids;
    })
  );

  await resolveStuckNoHash(now);
  await resolveStuckLegacy();
}

async function resolveStuckNoHash(now: number): Promise<void> {
  const noHashCutoff = new Date(now - 60_000).toISOString();
  const { data: noHashRows } = await pg.redemptions
    .raw()
    .select(
      "id, amount, processing_orig_amount, processing_started_at, wallet"
    )
    .eq("status", "processing")
    .is("processing_tx_hash", null)
    .is("tx_hash", null)
    .lt("processing_started_at", noHashCutoff)
    .limit(100);
  if (noHashRows && noHashRows.length > 0) {
    console.warn(
      `[resolver] разморозка ${noHashRows.length} processing-строк без tx_hash (lock'нуты >60с назад, TX точно не подписана).`
    );
    for (const r of noHashRows as Array<{
      id: string;
      amount: number;
      processing_orig_amount: number | null;
      wallet: string;
    }>) {
      const restoreAmount =
        r.processing_orig_amount != null ? r.processing_orig_amount : r.amount;
      await pg.redemptions
        .raw()
        .update({
          status: "pending",
          amount: restoreAmount,
          processing_tx_hash: null,
          processing_started_at: null,
          processing_orig_amount: null,
        })
        .eq("id", r.id)
        .eq("status", "processing")
        .is("processing_tx_hash", null)
        .is("tx_hash", null);
    }
  }
}

async function resolveStuckLegacy(): Promise<void> {
  const { data: legacyRows } = await pg.redemptions
    .raw()
    .select("id, amount, processing_orig_amount")
    .eq("status", "processing")
    .is("processing_tx_hash", null)
    .is("processing_started_at", null)
    .is("tx_hash", null)
    .limit(100);
  if (legacyRows && legacyRows.length > 0) {
    console.warn(
      `[resolver] разморозка ${legacyRows.length} legacy processing-строк без метки времени.`
    );
    for (const r of legacyRows as Array<{
      id: string;
      amount: number;
      processing_orig_amount: number | null;
    }>) {
      const restoreAmount =
        r.processing_orig_amount != null ? r.processing_orig_amount : r.amount;
      await pg.redemptions
        .raw()
        .update({
          status: "pending",
          amount: restoreAmount,
          processing_tx_hash: null,
          processing_started_at: null,
          processing_orig_amount: null,
        })
        .eq("id", r.id)
        .eq("status", "processing")
        .is("processing_tx_hash", null)
        .is("processing_started_at", null)
        .is("tx_hash", null);
    }
  }
}
