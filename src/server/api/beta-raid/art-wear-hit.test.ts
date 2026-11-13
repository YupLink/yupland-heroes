// Износ за удар (art-wear-hit): один ключ на удар, повтор не задваивает,
// сломанный не трогается, сломалось — кэш силы героя сброшен, сбой удар не роняет.
// Поломка = снятие (§8.63 п.3): при запущенной механике тот же запрос снимает
// сломанное со всех героев аккаунта и пишет событие для плашки; не запущена —
// запрос прежний, без снятия.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
let reply: unknown[] | Error = [];
const dropped: string[] = [];
const gate = vi.hoisted(() => ({ on: false, asked: [] as Array<string | null> }));
vi.mock("../art-repair/art-repair-gate", () => ({
  artBrokenOn: async (w: string | null) => {
    gate.asked.push(w);
    return gate.on;
  },
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    if (reply instanceof Error) throw reply;
    return reply;
  },
}));
vi.mock("./hero-power", () => ({
  invalidateHeroPower: (w?: string) => void dropped.push(w ?? ""),
}));

const { artWearHitSql, wearHeroArtifacts } = await import("./art-wear-hit");

beforeEach(() => {
  sqls.length = 0;
  dropped.length = 0;
  gate.on = false;
  gate.asked.length = 0;
  reply = [{ claimed: 1, worn: 2, broke: 0 }];
});

describe("artWearHitSql", () => {
  const sql = artWearHitSql("hero_1", "aw_key", "obj:hp1:0:t");

  it("ключ удара: повтор с тем же ключом ничего не снимает", () => {
    expect(sql).toContain(
      "INSERT INTO yuplink.art_wear_op (op, hero_id) VALUES ('aw_key', 'hero_1')",
    );
    expect(sql).toContain("ON CONFLICT (op) DO NOTHING");
    // Отметка боя — только если ключ занят ЭТИМ запросом; износ — только у
    // артефактов с новой отметкой.
    expect(sql).toMatch(
      /INSERT INTO yuplink\.art_wear_fight[\s\S]*WHERE EXISTS \(SELECT 1 FROM claim\)/,
    );
    expect(sql).toContain("WHERE u.id IN (SELECT item_id FROM fresh)");
  });

  it("за бой — один раз: отметка (артефакт, бой), второй удар по той же цели не снимает", () => {
    expect(sql).toContain("INSERT INTO yuplink.art_wear_fight (item_id, fight)");
    expect(sql).toContain("SELECT u.id, 'obj:hp1:0:t'");
    expect(sql).toContain("ON CONFLICT (item_id, fight) DO NOTHING");
    expect(sql).toContain("RETURNING item_id");
  });

  it("старые отметки боёв надетого убираются тем же запросом (30 дней)", () => {
    expect(sql).toContain("DELETE FROM yuplink.art_wear_fight f");
    expect(sql).toContain("f.at < now() - interval '30 days'");
  });

  it("износ считается в самом UPDATE: гонка двух ударов не теряет ни одного", () => {
    expect(sql).toContain("SET wear = LEAST(100, u.wear + (CASE lower(COALESCE(t.rarity, ''))");
  });

  it("сломанный не трогаем; только надетое на ЭТОГО героя и только его аккаунта", () => {
    expect(sql).toContain("u.wear < 100");
    expect(sql).toContain("h.id = 'hero_1' AND u.account_id = h.account_id");
    expect(sql).toContain("u.kind = 'artifact'");
    expect(sql).toContain("jsonb_each_text(CASE WHEN jsonb_typeof(q.equipped::jsonb) = 'object'");
  });

  it("надетые — по первичному ключу, а не перебором всех артефактов аккаунта", () => {
    // Несвязанный подзапрос (InitPlan) → Index Scan по pkey; связанный EXISTS
    // по h гонял подплан на каждую строку аккаунта.
    expect(sql).toMatch(
      /u\.id = ANY \(ARRAY\(SELECT e\.value FROM yuplink\.hero_instance q, [\s\S]*WHERE q\.id = 'hero_1'\)\)/,
    );
    expect(sql).not.toContain("e.value = u.id");
  });

  it("старые ключи героя убираются тем же запросом", () => {
    expect(sql).toContain("DELETE FROM yuplink.art_wear_op o");
    expect(sql).toContain("o.at < now() - interval '1 day'");
  });
});

describe("wearHeroArtifacts", () => {
  it("каждый удар — свой ключ удара; бой передаётся как есть", async () => {
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(sqls).toHaveLength(2);
    const key = (s: string) => /VALUES \('(aw_[^']+)'/.exec(s)?.[1];
    expect(key(sqls[0])).toBeTruthy();
    expect(key(sqls[0])).not.toBe(key(sqls[1]));
    expect(sqls[0]).toContain("'obj:hp1:0:t'");
  });

  it("ничего не сломалось — кэш силы героя не трогаем", async () => {
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(dropped).toEqual([]);
  });

  it("сломался артефакт — следующий бой уже без него (кэш сброшен)", async () => {
    reply = [{ claimed: 1, worn: 3, broke: 1 }];
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(dropped).toEqual(["w.near"]);
  });

  it("ключ уже стоял (повтор моста) — кэш сбрасываем на всякий случай", async () => {
    reply = [{ claimed: 0, worn: 0, broke: 0 }];
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(dropped).toEqual(["w.near"]);
  });

  it("сбой базы удар не роняет", async () => {
    reply = new Error("pool is closed");
    await expect(wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t")).resolves.toEqual([]);
  });
});

describe("поломка = снятие (§8.63 п.3)", () => {
  const on = artWearHitSql("hero_1", "aw_key", "obj:hp1:0:t", true);
  const off = artWearHitSql("hero_1", "aw_key", "obj:hp1:0:t", false);

  it("механика не запущена — запрос прежний: ни снятия, ни событий", () => {
    expect(off).toBe(artWearHitSql("hero_1", "aw_key", "obj:hp1:0:t"));
    expect(off).not.toContain("art_break_notice");
    expect(off).not.toContain("UPDATE yuplink.hero_instance");
  });

  it("сломанное этим ударом и уже сломанное на бойце — со ВСЕХ героев аккаунта", () => {
    expect(on).toContain(
      "SELECT id, account_id, template_id, name, image_url FROM upd WHERE wear >= 100",
    );
    expect(on).toMatch(/UNION ALL[\s\S]*u\.wear >= 100[\s\S]*u\.id = ANY \(ARRAY\(/);
    expect(on).toContain("UPDATE yuplink.hero_instance x");
    expect(on).toContain("WHERE e.value NOT IN (SELECT id FROM gone)");
    expect(on).toContain(
      "x.account_id = (SELECT b.account_id FROM yuplink.hero_instance b WHERE b.id = 'hero_1')",
    );
    // Предмет в инвентаре остаётся: user_game_item меняет только износ.
    expect(on.match(/UPDATE yuplink\.user_game_item/g)).toHaveLength(1);
    expect(on).not.toMatch(/DELETE FROM yuplink\.user_game_item/);
  });

  it("повтор удара ничего не задваивает: всё за ключом удара, событие — по ключу", () => {
    // gone (второй SELECT) — только если ключ занят этим запросом; upd — тоже.
    expect(on).toMatch(/gone AS \([\s\S]*WHERE EXISTS \(SELECT 1 FROM claim\)/);
    expect(on).toContain("WHERE EXISTS (SELECT 1 FROM gone)");
    expect(on).toContain("INSERT INTO yuplink.art_break_notice");
    expect(on).toContain("'abn_' || 'aw_key' || '_' || g.id");
    expect(on).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("ответ несёт события для плашки и число снятых", () => {
    expect(on).toContain("AS stripped");
    expect(on).toMatch(/json_build_object\('id', n\.id, 'itemId', n\.item_id,/);
    expect(on).toContain("FROM note n)::text AS notes");
  });

  it("флаг спрашиваем на каждый удар у этого кошелька", async () => {
    gate.on = true;
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(gate.asked).toEqual(["w.near"]);
    expect(sqls[0]).toContain("INSERT INTO yuplink.art_break_notice");
    gate.on = false;
    await wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t");
    expect(sqls[1]).not.toContain("art_break_notice");
  });

  it("снялось — события уходят наверх, кэш силы сброшен", async () => {
    gate.on = true;
    const notes = [{ id: "abn_k_u1", itemId: "u1", name: "Меч", imageUrl: "/m.webp" }];
    reply = [{ claimed: 1, worn: 1, broke: 1, stripped: 1, notes: JSON.stringify(notes) }];
    await expect(wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t")).resolves.toEqual(notes);
    expect(dropped).toEqual(["w.near"]);
  });

  it("уже сломанное снято без новой поломки — кэш силы всё равно сброшен", async () => {
    gate.on = true;
    reply = [{ claimed: 1, worn: 0, broke: 0, stripped: 1, notes: "[]" }];
    await expect(wearHeroArtifacts("w.near", "hero_1", "obj:hp1:0:t")).resolves.toEqual([]);
    expect(dropped).toEqual(["w.near"]);
  });
});
