// Кто какими NFT Heroes of Valdir владеет. Коллекция не умеет отдавать «токены адреса»,
// поэтому раз в 10 минут спрашиваем владельца у всех токенов пачками (~27 запросов к
// публичному узлу) и кладём в eth_hov_token.owner. Карточки токенов (имя героя,
// картинка) дочитываются из tokenURI для новых номеров. Один проход на все процессы.
import { mcpExec } from "../../db/mcpClient";
import { OWNER_BATCH } from "./config";
import { ownersOf, tokenMeta } from "./rpc";

const EVERY_MS = 10 * 60_000;

async function took(): Promise<boolean> {
  const rows = (await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES ('hov_index_pass', now()::text)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE yuplink.settings.value::timestamptz < now() - interval '9 minutes'
     RETURNING 1 AS ok;`,
    { wrapJson: false },
  ).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

async function maxKnown(): Promise<number> {
  const rows = (await mcpExec(`SELECT COALESCE(max(token_id), 0) AS n FROM yuplink.eth_hov_token;`, {
    wrapJson: true,
  })) as Array<{ n: number }>;
  return Number(rows?.[0]?.n ?? 0);
}

/** Дочитать карточки новых токенов (после max известного) и записать. */
async function addNewTokens(from: number): Promise<number> {
  let added = 0;
  for (let id = from + 1; id <= from + OWNER_BATCH; id++) {
    const m = await tokenMeta(id).catch(() => null);
    if (!m) break;
    const lirian = (m.heroName ?? "").toLowerCase().includes("lirian");
    await mcpExec(
      `INSERT INTO yuplink.eth_hov_token (token_id, hero_name, image, rarity, lirian, race)
       VALUES (${id}, ${lit(m.heroName)}, ${lit(m.image)}, ${lit(m.rarity)}, ${lirian}, ${lit(m.race)})
       ON CONFLICT (token_id) DO NOTHING;`,
      { wrapJson: false },
    );
    added++;
  }
  return added;
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Пачка владельцев с паузой: публичный узел режет частоту («Rate limit exceeded»), и без
 * пауз половина пачек приходит пустой. Пусто — ждём дольше и повторяем, до 5 раз.
 */
async function ownersPaced(ids: number[]): Promise<Map<number, string>> {
  for (let a = 0; a < 5; a++) {
    await sleep(1500 + a * 4000);
    const got = await ownersOf(ids).catch(() => new Map<number, string>());
    if (got.size > 0) return got;
  }
  return new Map();
}

const lit = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

/** Один проход: новые токены + владельцы всех. Отдаёт, сколько владельцев записано. */
export async function hovIndexPass(force = false): Promise<number> {
  if (!force && !(await took())) return 0;
  await addNewTokens(await maxKnown());
  const max = await maxKnown();
  let written = 0;
  for (let start = 1; start <= max; start += OWNER_BATCH) {
    const ids = Array.from({ length: Math.min(OWNER_BATCH, max - start + 1) }, (_, i) => start + i);
    const owners = await ownersPaced(ids);
    if (owners.size === 0) continue;
    const values = [...owners].map(([id, a]) => `(${id}, '${a}')`).join(", ");
    await mcpExec(
      `UPDATE yuplink.eth_hov_token t SET owner = v.owner, owner_at = now()
         FROM (VALUES ${values}) AS v(token_id, owner)
        WHERE t.token_id = v.token_id;`,
      { wrapJson: false },
    );
    written += owners.size;
  }
  return written;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Включить проход в этом процессе (зовёт первый просмотр списка NFT). */
export function startHovIndexer(): void {
  if (timer || typeof setInterval !== "function") return;
  const pass = () =>
    void hovIndexPass().catch((e) =>
      console.warn("[hov-index] проход не удался:", e instanceof Error ? e.message : e),
    );
  timer = setInterval(pass, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  pass();
}
