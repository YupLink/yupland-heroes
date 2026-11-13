// Миграция minecap-01 (владелец, 23.10.2026: «Зачислять сразу на баланс этот
// пендинг нельзя… пользователь сам нажал кнопку Забрать»): ни один путь
// потери шахты или гриба не зачисляет на счёт — пишет строку raid_mine_lose;
// «Забрать» — своя строка под локом, raid_mine_credit тем же ключом, отметка
// той же транзакцией; старые строки отмечены забранными один раз (повтор
// миграции новых не трогает); письма — без нового хозяина, раз в минуту.
// Суммы и ключи на живом Postgres гоняет проба PGlite (scratchpad
// batch11/minecap/run.mjs) и проба с откатом на проде (batch11/dry-minecap.sql).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/minecap-01-pending-claim.sql", import.meta.url)),
  "utf8",
);

/** Тело функции yuplink.<name> — от CREATE до её «END $fn$;». */
function fn(name: string): string {
  const at = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION yuplink\\.${name}\\(`));
  if (at < 0) throw new Error(`нет функции ${name}`);
  return sql.slice(at, sql.indexOf("END $fn$;", at));
}

const CREDITS =
  /raid_mine_credit|raid_mine_v2_settle|raid_mine_v2_close|raid_mine_claim\(|res_move|acc_move/;
/** Код без комментариев: в них прежние имена упомянуты словами. */
const code = (body: string): string => body.replace(/--[^\n]*/g, "");

describe("minecap-01: отнятое — к «Забрать», не на счёт", () => {
  it("одна транзакция с ограничением ожидания лока", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("старые строки — «забраны» и «уведомлены» только в миг появления claimed_at", () => {
    const mig = sql.slice(sql.indexOf("DO $mig$"), sql.indexOf("END $mig$;"));
    expect(mig).toContain("column_name = 'claimed_at'");
    expect(mig).toMatch(/IF NOT EXISTS \(SELECT 1 FROM information_schema\.columns/);
    expect(mig).toContain(
      "SET claimed_at = seized_at, notified_at = COALESCE(notified_at, seized_at)",
    );
    // Вне этого блока массовой отметки нет — повтор миграции не «забирает» новые строки.
    expect(sql.replace(mig, "")).not.toMatch(/SET claimed_at = seized_at/);
    expect(sql).toContain("ALTER COLUMN new_account DROP NOT NULL");
  });

  it("raid_mine_lose считает, но не зачисляет; ключи — как у прежних выплат", () => {
    const lose = fn("raid_mine_lose");
    expect(code(lose)).not.toMatch(CREDITS);
    expect(lose).toContain(
      "v_tag := CASE WHEN p_kind IN ('capture', 'take') THEN 'cap' ELSE '' END;",
    );
    expect(lose).toContain("||':'||v_tag||(COALESCE(st.claimed_hours, 0) + due)::text;");
    expect(lose).toContain("IF p_kind = 'break' AND yuplink.raid_mine_v2_period(cfg) <= 1 THEN");
    expect(lose).toContain("||':tail'");
    expect(lose).toContain("ON CONFLICT (map_id, q, r, old_captured_at) DO NOTHING");
    expect(lose).toContain("CASE WHEN p_kind = 'island' THEN now() END");
  });

  it("захват, подъём, поломка, разборка, гниль, остров — через raid_mine_lose, без зачисления", () => {
    const paths: Array<[string, string]> = [
      ["raid_mine_capture_v2", "raid_mine_lose(p_map, p_q, p_r, 'capture', p_account)"],
      [
        "raid_mine_capture",
        "CASE WHEN yuplink.raid_mushroom_kind(v2cfg) IS NOT NULL THEN 'take' ELSE 'capture' END",
      ],
      ["raid_mine_break", "raid_mine_lose(p_map, p_q, p_r, 'break', NULL)"],
      ["raid_mushroom_expire_cell", "raid_mine_lose(p_map, p_q, p_r, 'expire', NULL)"],
      ["raid_mine_island_release", "raid_mine_lose(p_map, p_q, p_r, 'island', NULL)"],
      ["raid_mine_dismantle", "SET kind = 'dismantle'"],
    ];
    for (const [name, call] of paths) {
      const body = fn(name);
      expect(body, name).toContain(call);
      expect(code(body), name).not.toMatch(CREDITS);
    }
    expect(fn("raid_mine_break")).toContain("broke := true; owner := st.owner_account;");
    expect(fn("raid_mine_break")).not.toMatch(/amount := cl\.amount/);
    expect(fn("raid_mushroom_expire_cell")).toContain("'paid', 0");
    expect(fn("raid_mine_dismantle")).toContain("AND old_captured_at = v_cap");
    expect(fn("raid_mine_island_release")).toContain("RAISE EXCEPTION 'island.not_island'");
  });

  it("«Забрать»: своя строка под локом, тот же ключ, отметка той же транзакцией, повтор — was", () => {
    const claim = fn("raid_mine_lost_claim");
    expect(claim).toContain("WHERE id = p_id FOR UPDATE;");
    expect(claim).toContain(
      "l.old_account IS DISTINCT FROM p_account THEN RAISE EXCEPTION 'mine_lost_gone'",
    );
    expect(claim).toContain("l.resource, l.token, l.amount, l.ref);");
    expect(claim).toContain("l.resource, l.token, l.tail, l.tail_ref);");
    // Кошелёк того, кто жмёт (его аккаунт проверен), а не прежний хозяйский:
    // энергия идёт на acc_of(кошелька) — отвязанный кошелёк увёл бы её.
    expect(code(claim)).not.toContain("COALESCE(l.old_wallet, p_wallet)");
    expect(claim.split("COALESCE(NULLIF(p_wallet, ''), l.old_wallet)").length - 1).toBe(2);
    const credit = claim.indexOf("raid_mine_credit");
    const mark = claim.indexOf("SET claimed_at = now()");
    expect(credit).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(credit);
    expect(claim).toMatch(/IF l\.claimed_at IS NOT NULL THEN[\s\S]*'was', true/);
  });

  it("письма: один обход за раз, раз в минуту на игрока, отметка тем же вызовом, без нового хозяина", () => {
    const due = fn("raid_mine_lost_due");
    expect(due).toContain("pg_try_advisory_xact_lock(hashtext('minelost:notify'))");
    expect(due).toContain("x.notified_at > now() - interval '60 seconds'");
    expect(due).toContain("FOR UPDATE OF l SKIP LOCKED");
    expect(due).toContain("SET notified_at = now()");
    expect(due).not.toMatch(/new_account/);
  });

  it("эпоха нового отрезка обходит и хвост, ждущий в журнале", () => {
    const start = fn("raid_mine_v2_start");
    expect(start).toContain("FROM yuplink.res_ledger l WHERE l.kind = 'mine' AND l.ref = k");
    expect(start).toContain("FROM yuplink.raid_mine_capture_log c WHERE c.tail_ref = k");
  });
});
