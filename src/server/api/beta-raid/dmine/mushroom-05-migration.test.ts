// mushroom-05: обход «конец жизни» гасит гриб, только если под локом рюкзака герой
// гриба тот же, что прочитан до лока (гриб мог уехать к основному — рынок героев).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(new URL(`../../../../../migrations/${f}`, import.meta.url), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("mushroom-05: сверка героя под локом", () => {
  for (const f of ["mushroom-05-expire-hero-guard.sql", "mushroom-03-kinds-spawn.sql"]) {
    it(`${f}: UPDATE 'gone' — с тем же героем, лок до UPDATE`, () => {
      const s = flat(read(f));
      const at = s.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_expire_item");
      const body = s.slice(at, s.indexOf("END $fn$;", at));
      expect(body).toContain(
        "UPDATE yuplink.raid_dmine SET state = 'gone' WHERE id = p_id AND state = 'item' AND dies_at <= now() AND hero_id IS NOT DISTINCT FROM v_hero;",
      );
      expect(body.indexOf("pg_advisory_xact_lock(hashtext('bp:' || v_hero))")).toBeLessThan(
        body.indexOf("SET state = 'gone'"),
      );
    });
  }
});
