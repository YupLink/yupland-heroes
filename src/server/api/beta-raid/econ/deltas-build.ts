// Сборка строк «дельта игрока по валюте» из агрегата SQL: общая для отчёта
// дельт (все валюты) и для карточки ресурса (топ приход/расход по одной).
import type { DeltaRow, KindAmount, EconRange } from "@/lib/econ/types";
import { mcpExec } from "@/server/db/mcpClient";
import { groupOfKind, type EconLedger } from "./kinds";
import { displayNames } from "./names";
import { deltaAggSql, kindLabel, tradeMarginSql, type MovementFilter } from "./deltas-sql";

type AggRow = {
  account_id: string;
  currency: string;
  ledger: EconLedger;
  kind: string;
  prefix: string;
  plus: number | string;
  minus: number | string;
  n: number | string;
};

type MarginRow = {
  account_id: string;
  currency: string;
  trades: number | string;
  margin: number | string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Дельты по (игрок, валюта), отсортированные по |net| убыв. spent — модуль
 * расхода (положительное число), net = earned − spent. byKind — со знаком.
 */
export async function buildDeltaRows(
  range: EconRange,
  currency?: string,
  ledgers?: EconLedger[],
): Promise<DeltaRow[]> {
  const f: MovementFilter = { currency, ledgers };
  const [agg, margins] = await Promise.all([
    mcpExec(deltaAggSql(range, f), { wrapJson: true }) as Promise<AggRow[]>,
    // Журнал сделок появился с выката (22.09) — на старом окне его нет, и
    // ошибка «нет таблицы» не должна валить дельты.
    (mcpExec(tradeMarginSql(range, currency), { wrapJson: true }) as Promise<MarginRow[]>).catch(
      () => [] as MarginRow[],
    ),
  ]);

  const rows = new Map<string, DeltaRow>();
  const kinds = new Map<string, Map<string, KindAmount>>();
  const rowOf = (accountId: string, cur: string): DeltaRow => {
    const key = `${accountId}|${cur}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        accountId,
        displayName: "",
        telegramUsername: null,
        currency: cur,
        earned: 0,
        spent: 0,
        net: 0,
        byKind: [],
        trades: 0,
        margin: null,
      };
      rows.set(key, row);
      kinds.set(key, new Map());
    }
    return row;
  };

  for (const a of agg ?? []) {
    const row = rowOf(a.account_id, a.currency);
    const plus = num(a.plus);
    const minus = num(a.minus);
    row.earned += plus;
    row.spent += -minus;
    const ref = a.prefix ? `${a.prefix}:` : null;
    const label = kindLabel(a.ledger, a.kind, a.prefix);
    const byKind = kinds.get(`${a.account_id}|${a.currency}`)!;
    const k = byKind.get(label) ?? {
      kind: label,
      group: groupOfKind(a.ledger, a.kind, ref),
      amount: 0,
      n: 0,
    };
    k.amount += plus + minus;
    k.n += num(a.n);
    byKind.set(label, k);
  }

  for (const m of margins ?? []) {
    const row = rows.get(`${m.account_id}|${m.currency}`);
    if (!row) continue;
    row.trades = num(m.trades);
    row.margin = num(m.margin);
  }

  const names = await displayNames([...rows.values()].map((r) => r.accountId));
  const out: DeltaRow[] = [];
  for (const [key, row] of rows) {
    row.net = row.earned - row.spent;
    row.byKind = [...kinds.get(key)!.values()].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
    );
    const name = names.get(row.accountId);
    if (name) {
      row.displayName = name.displayName;
      row.telegramUsername = name.telegramUsername;
    }
    out.push(row);
  }
  return out.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}
