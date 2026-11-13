// weather-04: обряд шамана. Голоса — один на аккаунт за смену (ключ слот+аккаунт),
// бросок следующей смены берёт голоса прошлого слота под той же блокировкой строки,
// что держит обряд; шаман списывается в той же транзакции; потолок — 90 % (не ниже
// шанса админа). Совпадение голосов базы и кода (raid_weather_apply_votes = applyVotes)
// и неизменность броска без голосов сверены на проде в откатываемой транзакции.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RITUAL_CAP, RITUAL_PCT, RITUAL_TARGETS } from "@/lib/raid/weatherRitual";

const raw = readFileSync(
  new URL("../../../../../migrations/weather-04-ritual.sql", import.meta.url),
  "utf8",
);
const flat = raw.replace(/\s+/g, " ");
const fnBody = (name: string): string => {
  const at = flat.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  if (at < 0) throw new Error(`нет функции ${name}`);
  return flat.slice(at, flat.indexOf("$fn$;", at));
};

describe("weather-04: обряд шамана", () => {
  it("голос — один на аккаунт за смену, цели — те же, что в коде", () => {
    expect(flat).toContain("PRIMARY KEY (slot_at, account_id)");
    for (const t of RITUAL_TARGETS) expect(flat).toContain(`'${t}'`);
  });

  it("+3 и потолок 90 — те же числа, что в коде", () => {
    const apply = fnBody("raid_weather_apply_votes");
    expect(RITUAL_PCT).toBe(3);
    expect(RITUAL_CAP).toBe(90);
    expect(apply).toContain("d := 3 * vs[i];");
    expect(apply).toContain("greatest(90, base[i])");
  });

  it("бросок следующей смены — с голосами прошлого слота и под замком его строки", () => {
    const ensure = fnBody("raid_weather_ensure");
    expect(ensure).toMatch(/ORDER BY w\.slot_at DESC LIMIT 1 FOR UPDATE;/);
    expect(ensure).toContain("v_votes := yuplink.raid_weather_votes(p_map, v_row.slot_at);");
    expect(ensure).toContain(
      "yuplink.raid_weather_apply_votes( yuplink.raid_weather_level_dist(v_row.level, v_odds), v_votes)",
    );
  });

  it("обряд: по очереди на аккаунт, повтор opId — ok, шаман — в той же транзакции", () => {
    const ritual = fnBody("raid_weather_ritual");
    expect(ritual).toContain("pg_advisory_xact_lock(hashtext('wx-ritual:' || p_acc))");
    expect(ritual).toContain("WHERE v.account_id = p_acc AND v.op_id = p_op) THEN RETURN 'ok';");
    expect(flat).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS raid_weather_vote_op ON yuplink.raid_weather_vote (account_id, op_id);",
    );
    expect(ritual).toMatch(/FOR UPDATE; IF NOT FOUND THEN RETURN 'no_weather';/);
    expect(ritual).toContain("IF NOT yuplink.castle_shaman_take(p_acc) THEN RETURN 'no_shaman';");
    expect(ritual.indexOf("castle_shaman_take")).toBeLessThan(
      ritual.indexOf("INSERT INTO yuplink.raid_weather_vote"),
    );
  });
});
