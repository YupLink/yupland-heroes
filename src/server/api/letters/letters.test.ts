// Письма на весь экран: выборка «мои непрочитанные» (всем / мне в списке,
// включённые, без прочитанных мной), отметка «Понятно», админка («Только мне»
// = аккаунт админа, список «кому» → аккаунты, «показать заново»). База подменена.
//
// Смысл выборки myLettersSql проверен и вживую одним SELECT на VALUES-таблицах
// (без касания боевых): из «всем / мне / другому / выключено / прочитано мной /
// прочитано другим» приходят ровно «всем», «мне», «прочитано другим».
// «Показывать до» и английская версия — letter-02-en-until.sql.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  sql: [] as string[],
  wallet: "me.near" as string | null,
  rows: [] as unknown[],
  resolved: new Map<string, string>(),
  updated: true,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({
  getCurrentWallet: () => db.wallet,
  requireAdmin: () => "admin.near",
}));
vi.mock("../beta-raid/owner", () => ({
  raidOwner: async (w: string) => {
    const acc = { "me.near": "acc_me", "admin.near": "acc_admin" }[w];
    if (!acc) throw new Error(`Нет аккаунта для ключа ${w}`);
    return acc;
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    db.sql.push(flat);
    if (flat.startsWith("SELECT e.v AS entry")) {
      const list = /ARRAY\[(.*?)\]::text\[\]/.exec(flat)?.[1] ?? "";
      return [...list.matchAll(/'([^']*)'/g)].map((m) => ({
        entry: m[1],
        account_id: db.resolved.get(m[1]) ?? null,
      }));
    }
    if (flat.startsWith("INSERT INTO yuplink.player_letter ")) return [{ id: "letter_new" }];
    if (flat.startsWith("UPDATE yuplink.player_letter")) return db.updated ? [{ id: "l1" }] : [];
    if (flat.startsWith("SELECT")) return db.rows;
    return [];
  },
}));

const { myLettersSql, markSeenSql } = await import("./letters-sql");
const { getMyLetters, markLetterSeen } = await import("./letters-player");
const { adminLetterList, adminLetterSave, adminLetterSetActive } = await import("./letters-admin");

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const base = { title: "Объявлен турнир", body: "Текст", audience: "me" as const, accounts: [] };

beforeEach(() => {
  Object.assign(db, { sql: [], wallet: "me.near", rows: [], updated: true });
  db.resolved = new Map([
    ["acc_a", "acc_a"],
    ["123456", "acc_tg"],
    ["bob.near", "acc_bob"],
  ]);
});

describe("выборка моих писем", () => {
  const sql = flat(myLettersSql("acc_me"));

  it("включённые, всем или мне в списке", () => {
    expect(sql).toContain("WHERE l.active");
    expect(sql).toContain("(l.audience = 'all' OR 'acc_me' = ANY(l.accounts))");
  });

  it("прочитанные мной не приходят, чужое прочтение не мешает", () => {
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.player_letter_seen s WHERE s.letter_id = l.id AND s.account_id = 'acc_me')",
    );
  });

  it("истёкшие не приходят, бессрочные — приходят; английская версия едет с письмом", () => {
    expect(sql).toContain("AND (l.show_until IS NULL OR l.show_until > now())");
    expect(sql).toContain("SELECT l.id, l.title, l.body, l.image, l.title_en, l.body_en");
  });

  it("старые первыми; кавычки в аккаунте не ломают SQL", () => {
    expect(sql).toContain("ORDER BY l.created_at, l.id");
    expect(myLettersSql("a'b")).toContain("'a''b' = ANY(l.accounts)");
  });

  it("сервер: без кошелька или аккаунта — пусто и без запросов", async () => {
    db.wallet = null;
    await expect(getMyLetters()).resolves.toEqual([]);
    db.wallet = "ghost.near";
    await expect(getMyLetters()).resolves.toEqual([]);
    expect(db.sql).toEqual([]);
  });

  it("сервер: спрашивает по аккаунту, пустые поля — пустыми", async () => {
    db.rows = [{ id: "l1", title: "T", body: null, image: "  " }];
    await expect(getMyLetters()).resolves.toEqual([
      { id: "l1", title: "T", body: "", image: null, titleEn: null, bodyEn: null },
    ]);
    expect(db.sql[0]).toContain("'acc_me' = ANY(l.accounts)");
  });

  it("сервер: английская версия как есть, из пробелов — как нет", async () => {
    db.rows = [{ id: "l1", title: "T", body: "B", image: null, title_en: "En", body_en: "  " }];
    const [l] = await getMyLetters();
    expect(l).toMatchObject({ titleEn: "En", bodyEn: null });
  });
});

describe("«Понятно»", () => {
  it("одна отметка на аккаунт: повтор ничего не меняет, только адресованное мне", () => {
    const sql = flat(markSeenSql("l1", "acc_me"));
    expect(sql).toContain("INSERT INTO yuplink.player_letter_seen (letter_id, account_id)");
    expect(sql).toContain(
      "WHERE l.id = 'l1' AND (l.audience = 'all' OR 'acc_me' = ANY(l.accounts))",
    );
    expect(sql).toContain("ON CONFLICT (letter_id, account_id) DO NOTHING");
  });

  it("сервер пишет отметку на аккаунт игрока", async () => {
    await markLetterSeen({ data: { id: "l1" } });
    expect(db.sql[0]).toContain("SELECT l.id, 'acc_me' FROM yuplink.player_letter l");
  });
});

describe("админка", () => {
  const ins = () => db.sql.find((s) => s.startsWith("INSERT INTO yuplink.player_letter "))!;

  it("«Только мне» — список из аккаунта админа", async () => {
    await expect(adminLetterSave({ data: base })).resolves.toEqual({ id: "letter_new" });
    expect(ins()).toContain("'list', ARRAY['acc_admin']::text[], 'admin.near'");
  });

  it("«Всем» — без списка", async () => {
    await adminLetterSave({ data: { ...base, audience: "all", accounts: ["x"] } });
    expect(ins()).toContain("'all', '{}'::text[]");
  });

  it("список: acc_…, Telegram-id и кошелёк → аккаунты", async () => {
    const accounts = ["acc_a", "123456", "bob.near", "acc_a"];
    await adminLetterSave({ data: { ...base, audience: "list", accounts } });
    expect(ins()).toContain("ARRAY['acc_a','acc_tg','acc_bob']::text[]");
  });

  it("неизвестный в списке — ошибка с ним, письмо не пишется", async () => {
    const data = { ...base, audience: "list" as const, accounts: ["acc_a", "zzz"] };
    await expect(adminLetterSave({ data })).rejects.toThrow("letter.err.unknown:zzz");
    expect(db.sql.some((s) => s.startsWith("INSERT"))).toBe(false);
  });

  it("пустой заголовок — ключ ошибки и ни одного запроса", async () => {
    await expect(adminLetterSave({ data: { ...base, title: " " } })).rejects.toThrow(
      "letter.err.title",
    );
    expect(db.sql).toEqual([]);
  });

  it("«показать заново» при правке забывает прочитавших; у нового — нечего забывать", async () => {
    await adminLetterSave({ data: { ...base, id: "l1", again: true } });
    expect(db.sql).toContain("DELETE FROM yuplink.player_letter_seen WHERE letter_id = 'l1';");
    db.sql = [];
    await adminLetterSave({ data: { ...base, again: true } });
    expect(db.sql.some((s) => s.startsWith("DELETE"))).toBe(false);
  });

  it("выключить несуществующее — not_found", async () => {
    db.updated = false;
    await expect(adminLetterSetActive({ data: { id: "nope", active: false } })).rejects.toThrow(
      "letter.err.not_found",
    );
  });

  it("список отдаёт аккаунт админа — узнать «Только мне»", async () => {
    db.rows = [
      {
        id: "l1",
        title: "T",
        body: "B",
        image: null,
        audience: "list",
        accounts: ["acc_admin"],
        active: true,
        created_ms: "1791129872697.764",
        seen: "2",
      },
    ];
    const r = await adminLetterList();
    expect(r.me).toBe("acc_admin");
    expect(r.letters[0]).toMatchObject({ audience: "list", accounts: ["acc_admin"], seen: 2 });
    expect(r.letters[0].createdAt).toMatch(/^2026-/);
  });
});
