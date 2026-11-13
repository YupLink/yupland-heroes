// База входа через Google (migrations/google-01-login.sql): настройки, аккаунты,
// журнал входов. Только сервер.
//
// Google-аккаунт = строка account_google (sub → свой id ≥ 2^52), а дальше игрок
// живёт как новый Telegram-игрок без кошелька: users.wallet `tg<id>`,
// users.telegram_id = id, стартовый набор — тем же skipHallwayForNewPlayer.
import { pg } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { GOOGLE_TG_BASE, isGoogleTg } from "@/lib/auth/googleTg";

export const GOOGLE_CLIENT_ID_KEY = "google_client_id";
/** Вход для всех: `on` (владелец, 06.11.2026: «откроем для новых игроков») — выключатель в /admin/google. */
export const GOOGLE_OPEN_KEY = "google_login";
/** «Одно устройство — один аккаунт» (владелец, 29.10): включено, пока нет строки 'off'. */
export const GOOGLE_DEVICE_LIMIT_KEY = "google_one_per_device";

export type GoogleSettings = { clientId: string | null; open: boolean; deviceLimit: boolean };

export async function readGoogleSettings(): Promise<GoogleSettings> {
  const { data, error } = await pg.settings
    .raw()
    .select("key,value")
    .in("key", [GOOGLE_CLIENT_ID_KEY, GOOGLE_OPEN_KEY, GOOGLE_DEVICE_LIMIT_KEY]);
  if (error) throw new Error(`google settings: ${error.message}`);
  const rows = (data ?? []) as Array<{ key: string; value: string }>;
  const val = (k: string) => rows.find((r) => r.key === k)?.value?.trim() ?? "";
  return {
    clientId: val(GOOGLE_CLIENT_ID_KEY) || null,
    open: val(GOOGLE_OPEN_KEY) === "on",
    deviceLimit: val(GOOGLE_DEVICE_LIMIT_KEY) !== "off",
  };
}

export async function saveGoogleOpen(on: boolean): Promise<void> {
  await pg.settings.upsert(
    { key: GOOGLE_OPEN_KEY, value: on ? "on" : "off" },
    { onConflict: "key" },
  );
}

export async function saveGoogleDeviceLimit(on: boolean): Promise<void> {
  await pg.settings.upsert(
    { key: GOOGLE_DEVICE_LIMIT_KEY, value: on ? "on" : "off" },
    { onConflict: "key" },
  );
}

/** Есть ли уже Google-аккаунт с этим sub (вход, а не создание). */
export async function googleAccountExists(sub: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.account_google WHERE sub = ${sqlStr(sub)}`,
    { wrapJson: true },
  )) as unknown[];
  return rows.length > 0;
}

/**
 * С этого устройства уже входили ДРУГИМ Google-аккаунтом: та же метка браузера
 * или тот же слепок с того же адреса сети за сутки (анонимка метку стирает, слепок —
 * нет; слепок без адреса не берём — одинаковые телефоны разных людей совпадают, а
 * адрес оператора общий у многих — поэтому слепок+адрес только за последние сутки).
 */
export async function deviceTaken(
  sub: string,
  d: { device: string | null; fp: string | null; ip: string | null },
): Promise<boolean> {
  const by: string[] = [];
  if (d.device) by.push(`device = ${sqlStr(d.device)}`);
  if (d.fp && d.ip)
    by.push(`(fp = ${sqlStr(d.fp)} AND ip = ${sqlStr(d.ip)} AND at > now() - interval '1 day')`);
  if (by.length === 0) return false;
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.google_login_log
      WHERE sub <> ${sqlStr(sub)} AND (${by.join(" OR ")}) LIMIT 1`,
    { wrapJson: true },
  )) as unknown[];
  return rows.length > 0;
}

/** Пустая строка — убрать Client ID (кнопка Google пропадёт). */
export async function saveGoogleClientId(clientId: string): Promise<void> {
  if (!clientId) await pg.settings.delete({ key: GOOGLE_CLIENT_ID_KEY });
  else
    await pg.settings.upsert({ key: GOOGLE_CLIENT_ID_KEY, value: clientId }, { onConflict: "key" });
}

const toTg = (v: unknown): number => {
  const n = Number(v);
  if (!isGoogleTg(n)) throw new Error(`google: id вне диапазона Google (${String(v)})`);
  return n;
};

/**
 * Аккаунт Google по sub — найти или завести. Гонку держит ключ sub: второй
 * параллельный вход с тем же sub ждёт первого и ничего не вставляет, а читает
 * уже вставленное следующим запросом — второго аккаунта не бывает.
 */
export async function claimGoogleAccount(
  sub: string,
  email: string | null,
  createdBy: string | null,
): Promise<{ tgId: number; fresh: boolean }> {
  const inserted = (await mcpExec(
    `INSERT INTO yuplink.account_google (sub, tg_id, email, created_by)
     VALUES (${sqlStr(sub)}, ${GOOGLE_TG_BASE} + nextval('yuplink.google_tg_seq'),
             ${email ? sqlStr(email) : "NULL"}, ${createdBy ? sqlStr(createdBy) : "NULL"})
     ON CONFLICT (sub) DO NOTHING
     RETURNING tg_id::text AS tg`,
    { wrapJsonCte: true },
  )) as Array<{ tg: string }>;
  if (inserted[0]) return { tgId: toTg(inserted[0].tg), fresh: true };
  const found = (await mcpExec(
    `SELECT tg_id::text AS tg FROM yuplink.account_google WHERE sub = ${sqlStr(sub)}`,
    { wrapJson: true },
  )) as Array<{ tg: string }>;
  if (!found[0]) throw new Error("google: аккаунт не завёлся");
  return { tgId: toTg(found[0].tg), fresh: false };
}

/**
 * Игрок Google в users — как новый Telegram без кошелька. true — строка создана
 * сейчас (новичок: прихожую пропускает со стартовым набором, как все).
 * Реферала НЕ прикрепляем (владелец: решится вместе с правилами против ферм).
 */
export async function ensureGoogleUser(tgId: number): Promise<boolean> {
  const wallet = `tg${tgId}`;
  const have = await pg.users.findOne({ wallet });
  if (have) return false;
  let created = false;
  try {
    await pg.users.insert({
      wallet,
      telegram_id: tgId,
      telegram_username: null,
      telegram_linked_at: new Date().toISOString(),
      referred_by: null,
      hallway_onboarding: true,
    });
    created = true;
  } catch (e) {
    // Гонка: параллельный вход уже создал строку — садимся на неё.
    if (!(await pg.users.findOne({ wallet }))) throw e;
  }
  if (created) {
    const { skipHallwayForNewPlayer } = await import("../hallway-skip");
    await skipHallwayForNewPlayer(wallet, tgId);
  }
  return created;
}

/** В журнал — и привязанный Google (§8.127): номер настоящего Telegram или кошелька. */
const anyTg = (v: number): number => {
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`google: плохой номер (${String(v)})`);
  return v;
};

export type GoogleLoginLogRow = {
  sub: string;
  tgId: number;
  device: string | null;
  fp: string | null;
  ip: string | null;
  ua: string | null;
  created: boolean;
};

const optStr = (v: string | null) => (v ? sqlStr(v) : "NULL");

/** Каждый Google-вход — строка журнала: устройство, слепок, адрес сети, браузер. */
export async function logGoogleLogin(r: GoogleLoginLogRow): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.google_login_log (sub, tg_id, device, fp, ip, ua, created)
     VALUES (${sqlStr(r.sub)}, ${anyTg(r.tgId)}, ${optStr(r.device)}, ${optStr(r.fp)},
             ${optStr(r.ip)}, ${optStr(r.ua)}, ${r.created ? "true" : "false"});`,
  );
}

export type GoogleAccountRow = {
  email: string | null;
  createdAt: string;
  /** Кто из админов завёл (Telegram-ник, кошелёк или аккаунт); null — завёл не админ. */
  createdBy: string | null;
  devices: number;
  fps: number;
  ips: number;
  logins: number;
  lastAt: string | null;
};

/** Google-аккаунты для админки: последние 200, новые сверху. */
export async function listGoogleAccounts(): Promise<GoogleAccountRow[]> {
  const rows = (await mcpExec(
    `SELECT g.email, g.created_at AS "createdAt",
            CASE WHEN g.created_by IS NULL THEN NULL ELSE COALESCE(
              (SELECT u.telegram_username FROM yuplink.users u
                WHERE u.account_id = g.created_by AND u.telegram_username IS NOT NULL LIMIT 1),
              (SELECT a.active_wallet FROM yuplink.accounts a WHERE a.id = g.created_by),
              g.created_by) END AS "createdBy",
            count(DISTINCT l.device) AS devices, count(DISTINCT l.fp) AS fps,
            count(DISTINCT l.ip) AS ips, count(l.id) AS logins, max(l.at) AS "lastAt"
       FROM yuplink.account_google g
       LEFT JOIN yuplink.google_login_log l ON l.sub = g.sub
      GROUP BY g.sub, g.email, g.created_at, g.created_by
      ORDER BY g.created_at DESC
      LIMIT 200`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    email: typeof r.email === "string" ? r.email : null,
    createdAt: String(r.createdAt ?? ""),
    createdBy: typeof r.createdBy === "string" ? r.createdBy : null,
    devices: Number(r.devices ?? 0),
    fps: Number(r.fps ?? 0),
    ips: Number(r.ips ?? 0),
    logins: Number(r.logins ?? 0),
    lastAt: typeof r.lastAt === "string" ? r.lastAt : null,
  }));
}
