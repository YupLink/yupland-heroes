// Доля владельцев казино (владелец, 09.11.2026, ПРАВИЛА §8.124, lib/casinoShare.ts).
//
// Часы: раз в 5 минут в каждом процессе. Подведение дня — функцией базы под общим
// локом (casino_share_settle_due): после полуночи МСК прошлые сутки подводятся один
// раз, доли героев ложатся в casino_share_payout. Дальше — строка «Казино» в «Добыче»
// каждой доле (ключ cshare:<день>:<герой>, повтор второй строки не кладёт). «Забрать»
// (grantRaidReward → claimCasinoShare) зачисляет золото и списывает его из пула казино
// одним вызовом базы (casino_share_pay). Забрали, а выдачи нет (процесс упал) — обход
// выдаёт сам; не вышло — строка обратно в «Добычу».
import { mcpExec } from "@/server/db/mcpClient";
import { queueEncounterReward } from "@/server/api/beta-raid/reward-queue";
import { BAD_REF } from "@/server/api/raid-reward-extra";
import {
  CASINO_SHARE_KIND,
  CASINO_SHARE_LATER,
  CASINO_SHARE_LOCATION,
  casinoShareKey,
  casinoShareRef,
  parseCasinoShareRef,
} from "@/lib/casinoShare";
import {
  markQueuedSql,
  paySql,
  releaseSql,
  settleSql,
  stuckSql,
  unqueuedSql,
} from "./casino-share-sql";

const EVERY_MS = 5 * 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

type Row = Record<string, unknown>;

async function rows(sql: string): Promise<Row[]> {
  const r = (await mcpExec(sql, { wrapJson: true })) as unknown[] | null;
  return Array.isArray(r) ? (r as Row[]) : [];
}

/** Выдать долю аккаунту. Чужая или нет — BAD_REF; сбой базы — CASINO_SHARE_LATER. */
async function pay(day: string, heroId: string, account: string): Promise<void> {
  try {
    await rows(paySql(day, heroId, account));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/casino_share_bad_ref/.test(msg) ? BAD_REF : CASINO_SHARE_LATER);
  }
}

/** «Забрать» строки «Казино»: только аккаунт доли; уже выдана — ничего. */
export async function claimCasinoShare(packId: string, wallet: string): Promise<void> {
  const ref = parseCasinoShareRef(packId);
  if (!ref) throw new Error(BAD_REF);
  const { raidOwner } = await import("@/server/api/beta-raid/owner");
  await pay(ref.day, ref.heroId, await raidOwner(wallet));
}

/** Один проход: подвести дни, поставить строки, довыдать забранное. */
export async function casinoSharePass(): Promise<void> {
  const settled = await rows(settleSql());
  for (const d of settled) {
    console.log(
      `[casino-share] ${String(d.day)}: итог ${d.profit}, фонд ${d.fund}, героев ${d.heroes}, по ${d.perHero}`,
    );
  }
  for (const p of await rows(unqueuedSql)) {
    const day = String(p.day);
    const heroId = String(p.heroId);
    await queueEncounterReward({
      account: String(p.account),
      mapId: CASINO_SHARE_LOCATION,
      cycleNo: 0,
      sourceName: CASINO_SHARE_KIND,
      kind: CASINO_SHARE_KIND,
      amount: Number(p.amount),
      packId: casinoShareRef(day, heroId),
      key: casinoShareKey(day, heroId),
      unlabeled: true,
    });
    await mcpExec(markQueuedSql(day, heroId));
  }
  for (const p of await rows(stuckSql)) {
    const day = String(p.day);
    const heroId = String(p.heroId);
    const ok = await pay(day, heroId, String(p.account)).then(
      () => true,
      () => false,
    );
    if (!ok) await mcpExec(releaseSql(day, heroId)).catch(() => {});
  }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await casinoSharePass();
  } catch (e) {
    console.warn("[casino-share] проход:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Запустить часы один раз на процесс (зовёт map-serve рядом с прочими). */
export function startCasinoShareTicker(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void tick(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void tick();
}
