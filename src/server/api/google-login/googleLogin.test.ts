// Гейт входа через Google: закрыт — только сессия админа, открыт — всем; повтор того
// же sub садится на тот же аккаунт; повтор токена — отказ; журнал пишется.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_TG_BASE } from "@/lib/auth/googleTg";

const st = vi.hoisted(() => ({
  settings: [] as Array<{ key: string; value: string }>,
  admin: true,
  wallet: "admin2b.example.near" as string | null,
  sub: "g-sub-1",
  seq: 0,
  google: [] as Array<{ sub: string; tg: number; email: string | null; by: string | null }>,
  users: [] as Array<{ wallet: string; telegram_id: number }>,
  log: [] as string[],
  seen: [] as Array<{ sub: string; device: string | null; fp: string | null; ip: string | null }>,
  starter: [] as string[],
  session: null as null | { wallet: string; tg: number },
  verified: 0,
  fresh: true,
  consumed: [] as Array<{ credential: string; exp: number }>,
  /** Google, привязанный к аккаунту Telegram (§8.127): sub → номер Telegram аккаунта. */
  links: [] as Array<{ sub: string; account: string; tg: number }>,
}));

type Fn = (a: { data: unknown }) => unknown;
vi.mock("@tanstack/react-start", () => {
  const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
    fn({ data: v ? v(a?.data) : a?.data });
  return {
    createServerFn: () => ({
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    }),
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (n: string) =>
    ({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "UA/1.0" })[n],
}));
vi.mock("../../auth", () => ({
  getCurrentWallet: () => st.wallet,
  isAdminWallet: () => st.admin,
  currentAccount: async () => (st.wallet ? "acc_admin" : null),
  setCurrentWallet: (wallet: string, tg: number) => {
    st.session = { wallet, tg };
  },
}));
vi.mock("./verifyGoogleToken", () => ({
  verifyGoogleIdToken: async (_c: string, clientId: string) => {
    st.verified++;
    expect(clientId).toBe("1-x.apps.googleusercontent.com");
    return { sub: st.sub, email: `${st.sub}@gmail.com`, exp: 2_000_000_000 };
  },
}));
vi.mock("./googleOnce", () => ({
  consumeGoogleToken: async (credential: string, exp: number) => {
    st.consumed.push({ credential, exp });
    return st.fresh;
  },
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v.replace(/'/g, "''")}'` }));
vi.mock("../hallway-skip", () => ({
  skipHallwayForNewPlayer: async (wallet: string) => void st.starter.push(wallet),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (/INSERT INTO yuplink\.account_google/.test(sql)) {
      const [, sub] = /VALUES \('([^']*)'/.exec(sql) ?? [];
      if (st.google.some((g) => g.sub === sub)) return [];
      const tg = GOOGLE_TG_BASE + ++st.seq;
      const by = /, '([^']*)'\)\s*ON CONFLICT/.exec(sql)?.[1] ?? null;
      st.google.push({ sub, tg, email: null, by });
      return [{ tg: String(tg) }];
    }
    if (/FROM yuplink\.account_google WHERE sub/.test(sql)) {
      const [, sub] = /sub = '([^']*)'/.exec(sql) ?? [];
      const g = st.google.find((x) => x.sub === sub);
      return g ? [{ tg: String(g.tg), x: 1 }] : [];
    }
    if (/FROM yuplink\.google_login_log/.test(sql)) {
      const [, sub] = /sub <> '([^']*)'/.exec(sql) ?? [];
      const dev = /device = '([^']*)'/.exec(sql)?.[1] ?? null;
      const fp = /fp = '([^']*)'/.exec(sql)?.[1] ?? null;
      const ip = /ip = '([^']*)'/.exec(sql)?.[1] ?? null;
      const hit = st.seen.some(
        (r) =>
          r.sub !== sub && ((dev && r.device === dev) || (fp && ip && r.fp === fp && r.ip === ip)),
      );
      return hit ? [{ x: 1 }] : [];
    }
    if (/INSERT INTO yuplink\.google_login_log/.test(sql)) {
      st.log.push(sql);
      const v = /VALUES \('([^']*)', \d+, (NULL|'[^']*'), (NULL|'[^']*'),\s*(NULL|'[^']*')/.exec(
        sql,
      );
      const un = (x?: string) => (!x || x === "NULL" ? null : x.slice(1, -1));
      if (v) st.seen.push({ sub: v[1], device: un(v[2]), fp: un(v[3]), ip: un(v[4]) });
      return [];
    }
    if (/FROM yuplink\.account_google_link/.test(sql)) {
      const [, sub] = /l\.sub = '([^']*)'/.exec(sql) ?? [];
      return st.links
        .filter((l) => l.sub === sub)
        .map((l) => ({ account: l.account, tg: String(l.tg) }));
    }
    throw new Error(`неожиданный SQL: ${sql}`);
  },
}));
vi.mock("../../db/pg", () => ({
  pg: {
    settings: {
      raw: () => ({ select: () => ({ in: async () => ({ data: st.settings, error: null }) }) }),
    },
    users: {
      findOne: async ({ wallet }: { wallet: string }) =>
        st.users.find((u) => u.wallet === wallet) ?? null,
      findMany: async ({ telegram_id }: { telegram_id: number }) =>
        st.users.filter((u) => u.telegram_id === telegram_id),
      insert: async (row: { wallet: string; telegram_id: number }) => {
        if (st.users.some((u) => u.wallet === row.wallet)) throw new Error("duplicate key");
        st.users.push(row);
      },
    },
  },
}));

const refs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const access = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("./verifyGoogleAccess", () => ({
  verifyGoogleAccessToken: async (token: string, clientId: string) => {
    access.calls.push(`${token}|${clientId}`);
    return { sub: "g-sub-acc", email: null, exp: Math.floor(Date.now() / 1000) + 3600 };
  },
}));
vi.mock("../../referralAttach", () => ({
  attachReferral: async (o: Record<string, unknown>) => (refs.push(o), null),
}));

const { loginWithGoogle, getGoogleLoginConfig } = await import("./googleLogin");
const login = () =>
  loginWithGoogle({ data: { credential: "x".repeat(40), device: "dev-1", fp: "a".repeat(64) } });

beforeEach(() => {
  st.settings = [{ key: "google_client_id", value: "1-x.apps.googleusercontent.com" }];
  st.admin = true;
  st.wallet = "admin2b.example.near";
  st.sub = "g-sub-1";
  st.seq = 0;
  st.google = [];
  st.users = [];
  st.log = [];
  st.seen = [];
  st.starter = [];
  st.session = null;
  st.verified = 0;
  st.fresh = true;
  st.consumed = [];
  st.links = [];
  refs.length = 0;
});

describe("Google, привязанный к аккаунту Telegram (11.11.2026, §8.127)", () => {
  it("вход — в тот аккаунт с его Telegram: без нового Google-аккаунта и правил устройства", async () => {
    st.links = [{ sub: "g-sub-1", account: "acc_tg", tg: 100200300 }];
    st.users = [{ wallet: "player.near", telegram_id: 100200300 }];
    const r = await loginWithGoogle({ data: { credential: "x".repeat(40) } });
    expect(r).toMatchObject({ ok: true, created: false, wallet: "player.near" });
    expect(st.session).toEqual({ wallet: "player.near", tg: 100200300 });
    expect(st.google).toEqual([]);
    expect(st.starter).toEqual([]);
    expect(st.log.at(-1)).toContain("100200300");
  });
});

describe("своя кнопка Google (09.11.2026): токен доступа", () => {
  it("токен доступа — сверка у Google с нашим Client ID, тот же аккаунт и сессия; повтор — отказ", async () => {
    const tok = "ya29." + "t".repeat(40);
    const go = () =>
      loginWithGoogle({ data: { accessToken: tok, device: "dev-1", fp: "a".repeat(64) } });
    const r = await go();
    expect(access.calls).toEqual([`${tok}|1-x.apps.googleusercontent.com`]);
    expect(r).toMatchObject({ ok: true, created: true });
    expect(st.google).toEqual([expect.objectContaining({ sub: "g-sub-acc" })]);
    expect(st.consumed.map((c) => c.credential)).toEqual([tok]);
    st.fresh = false; // тот же токен второй раз — googleOnce отказывает
    await expect(go()).rejects.toThrow("google.badToken");
  });

  it("ни ID-токена, ни токена доступа — или оба — отказ до Google", async () => {
    const call = (data: Record<string, unknown>) =>
      (async () => loginWithGoogle({ data } as never))();
    await expect(call({ device: "dev-1" })).rejects.toThrow();
    await expect(
      call({ credential: "x".repeat(40), accessToken: "y".repeat(40) }),
    ).rejects.toThrow();
    expect(st.verified).toBe(0);
  });
});

describe("реф-ссылка сайта (09.11.2026, вход не из Телеграма)", () => {
  it("новый Google-игрок по ?ref — другом пригласившего; вход старого по ссылке — без связи", async () => {
    const withRef = () =>
      loginWithGoogle({
        data: { credential: "x".repeat(40), device: "dev-1", fp: "a".repeat(64), ref: "tg777" },
      });
    const r = await withRef();
    expect(refs).toEqual([
      { friendWallet: r.wallet, friendTgId: GOOGLE_TG_BASE + 1, ref: "tg777" },
    ]);
    await withRef();
    expect(refs).toHaveLength(1);
  });
});

describe("loginWithGoogle — гейт и аккаунт", () => {
  it("вход закрыт и сессия не админа — отказ google.closed, ключи Google не трогаем", async () => {
    st.admin = false;
    st.wallet = "player.near";
    await expect(login()).rejects.toThrow("google.closed");
    st.wallet = null;
    await expect(login()).rejects.toThrow("google.closed");
    expect(st.verified).toBe(0);
    expect(st.google).toEqual([]);
    expect(st.session).toBeNull();
  });

  it("и для уже заведённого Google-аккаунта закрытый вход не пускает не админа", async () => {
    await login();
    st.admin = false;
    st.wallet = st.session?.wallet ?? null; // сам Google-игрок — не админ
    await expect(login()).rejects.toThrow("google.closed");
  });

  it("нет Client ID — google.noClientId", async () => {
    st.settings = [];
    await expect(login()).rejects.toThrow("google.noClientId");
  });

  it("админ заводит Google-игрока: id ≥ 2^52, tg<id>, стартовый набор, сессия, журнал", async () => {
    const r = await login();
    const tg = GOOGLE_TG_BASE + 1;
    expect(r).toEqual({ ok: true, created: true, wallet: `tg${tg}` });
    expect(st.google).toEqual([{ sub: "g-sub-1", tg, email: null, by: "acc_admin" }]);
    expect(st.users).toEqual([expect.objectContaining({ wallet: `tg${tg}`, telegram_id: tg })]);
    expect(st.starter).toEqual([`tg${tg}`]);
    expect(st.session).toEqual({ wallet: `tg${tg}`, tg });
    expect(st.log).toHaveLength(1);
    expect(st.log[0]).toContain("'203.0.113.7'");
    expect(st.log[0]).toContain("'dev-1'");
    expect(st.log[0]).toContain(`'${"a".repeat(64)}'`);
    expect(st.log[0]).toContain("'UA/1.0'");
  });

  it("повтор того же sub — тот же аккаунт, без второго набора; другой sub — новый", async () => {
    const first = await login();
    const again = await login();
    expect(again).toEqual({ ok: true, created: false, wallet: first.wallet });
    expect(st.google).toHaveLength(1);
    expect(st.starter).toHaveLength(1);
    expect(st.log).toHaveLength(2);
    st.sub = "g-sub-2";
    st.settings.push({ key: "google_one_per_device", value: "off" });
    const other = await login();
    expect(other.wallet).toBe(`tg${GOOGLE_TG_BASE + 2}`);
  });

  it("одно устройство — один аккаунт: второй sub с той же метки — отказ, вход в свой — с любого", async () => {
    await login();
    st.sub = "g-sub-2";
    await expect(login()).rejects.toThrow("google.deviceTaken");
    expect(st.google).toHaveLength(1);
    // анонимка: метка новая, но слепок и адрес те же
    await expect(
      loginWithGoogle({
        data: { credential: "x".repeat(40), device: "dev-anon", fp: "a".repeat(64) },
      }),
    ).rejects.toThrow("google.deviceTaken");
    // без метки или слепка новый аккаунт не заводится (иначе проверка обходится)
    await expect(
      loginWithGoogle({ data: { credential: "x".repeat(40), fp: "c".repeat(64) } }),
    ).rejects.toThrow("google.noDevice");
    await expect(
      loginWithGoogle({ data: { credential: "x".repeat(40), device: "dev-3" } }),
    ).rejects.toThrow("google.noDevice");
    // другое устройство и слепок — заводится
    await loginWithGoogle({
      data: { credential: "x".repeat(40), device: "dev-2", fp: "b".repeat(64) },
    });
    expect(st.google).toHaveLength(2);
    // первый аккаунт входит и с чужого устройства
    st.sub = "g-sub-1";
    await expect(
      loginWithGoogle({ data: { credential: "x".repeat(40), device: "dev-2" } }),
    ).resolves.toMatchObject({ created: false });
  });

  it("слепок не hex — не пишем; конфиг для всех: открыто только при 'on'", async () => {
    await login();
    await loginWithGoogle({ data: { credential: "x".repeat(40), fp: "<script>" } });
    expect(st.log[1]).not.toContain("<script>");
    await expect(getGoogleLoginConfig()).resolves.toEqual({
      clientId: "1-x.apps.googleusercontent.com",
      open: false,
    });
    st.settings.push({ key: "google_login", value: "on" });
    await expect(getGoogleLoginConfig()).resolves.toMatchObject({ open: true });
  });

  it("повтор того же токена — google.badToken: аккаунта, сессии и журнала нет", async () => {
    st.fresh = false;
    await expect(login()).rejects.toThrow("google.badToken");
    expect(st.consumed).toEqual([{ credential: "x".repeat(40), exp: 2_000_000_000 }]);
    expect(st.google).toEqual([]);
    expect(st.session).toBeNull();
    expect(st.log).toEqual([]);
  });

  it("вход открыт всем — не админ заводит себе аккаунт сам (без «кто создал»)", async () => {
    st.settings.push({ key: "google_login", value: "on" });
    st.admin = false;
    st.wallet = null;
    const r = await login();
    expect(r).toMatchObject({ ok: true, created: true });
    expect(st.google).toEqual([expect.objectContaining({ sub: "g-sub-1", by: null })]);
    expect(st.starter).toHaveLength(1);
  });
});
