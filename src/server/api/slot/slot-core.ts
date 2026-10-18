// Ядро слота на золото (серверный модуль): загрузка состояния, ход, запись
// одной транзакцией slot_commit. Без входа — аккаунт приходит параметром: так его
// зовут ручки slot-api и проверка на тестовых данных (casino-pawn.e2e.ts).
import { mcpExec } from "../../db/mcpClient";
import { sb } from "../../db/pg";
import { sqlStr } from "../raid-shared";
import { initialSlotState, type SlotState } from "@/lib/slot/state";
import { publicView } from "@/lib/slot/publicView";
import { totalBet } from "@/lib/slot/bets";
import {
  SlotRefused,
  cryptoRng,
  moneyKind,
  serverStep,
  type ClientAction,
} from "@/lib/slot/serverStep";

type Stored = SlotState & { sid?: string };
export type SlotView = { state: SlotState; gold: number; version: number };

export async function slotLoadFor(
  account: string,
): Promise<{ state: Stored; version: number; gold: number }> {
  const rows = (await mcpExec(
    `SELECT (SELECT state FROM yuplink.slot_session WHERE account_id = ${sqlStr(account)}) AS state,
            (SELECT version FROM yuplink.slot_session WHERE account_id = ${sqlStr(account)}) AS version,
            (SELECT amount FROM yuplink.account_resources
              WHERE account_id = ${sqlStr(account)} AND resource = 'gold') AS gold;`,
    { wrapJson: true },
  )) as Array<{ state: Stored | null; version: number | null; gold: number | null }>;
  const row = rows?.[0];
  const gold = Number(row?.gold) || 0;
  const base = row?.state ?? { ...initialSlotState(0), sid: newSid() };
  // Баланс автомата — всегда настоящее золото, не то, что лежит в сохранении.
  return { state: { ...base, balance: gold }, version: Number(row?.version) || 0, gold };
}

function newSid(): string {
  const b = new Uint32Array(2);
  globalThis.crypto.getRandomValues(b);
  return `${b[0].toString(36)}${b[1].toString(36)}`;
}

export function view(state: SlotState, gold: number, version: number): SlotView {
  return { state: publicView({ ...state, balance: gold }), gold, version };
}

/** Ход за аккаунт — ядро без входа (его же гоняет проверка на тестовых данных). */
export async function slotActFor(
  account: string,
  action: ClientAction,
  version: number,
): Promise<SlotView> {
  const cur = await slotLoadFor(account);
  // Ход сделан с устаревшего экрана (другая вкладка уже сходила) — отдаём свежее.
  if (cur.version !== version) return view(cur.state, cur.gold, cur.version);
  let next: Stored;
  try {
    next = serverStep(cur.state, action, cryptoRng());
  } catch (e) {
    if (e instanceof SlotRefused) throw new Error(e.message);
    throw e;
  }
  if (next === cur.state) return view(cur.state, cur.gold, cur.version);
  const sid = cur.state.sid ?? newSid();
  const delta = Math.round((next.balance - cur.gold) * 10000) / 10000;
  // Сколько золота должно лежать перед ходом. База проверяет это под замком до
  // сдвига: иначе при параллельной трате проигрыш падал бы «в минус», а выигрыш
  // проходил (migrations/slot-02-commit-need.sql).
  const need =
    action.type === "spin"
      ? totalBet(action.lines, action.bet)
      : action.type === "risk-start"
        ? cur.state.lastWin
        : 0;
  const stored: Stored = { ...next, sid };
  const { error, data: rows } = await sb.rpc("slot_commit", {
    p_account: account,
    p_version: cur.version,
    p_state: stored,
    p_delta: delta,
    p_kind: moneyKind(action),
    p_ref: `slot:${account}:${sid}:${cur.version + 1}`,
    p_need: need,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (/в минус/.test(msg)) throw new Error("slot.not_enough");
    if (/slot_version/.test(msg)) {
      const fresh = await slotLoadFor(account);
      return view(fresh.state, fresh.gold, fresh.version);
    }
    throw new Error(msg || "slot.load_error");
  }
  const res = (Array.isArray(rows) ? rows[0] : rows) as {
    version?: number;
    gold?: number;
  } | null;
  return view(stored, Number(res?.gold) || 0, Number(res?.version) || cur.version + 1);
}
