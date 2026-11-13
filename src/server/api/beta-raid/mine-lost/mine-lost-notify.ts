// «Шахту отняли» — письмо игрового бота и строка в «Добыче» (владелец одобрил
// 23.10.2026): в момент, когда хозяин теряет шахту или гриб (захват, подъём
// гриба, разборка, поломка, гниль гриба). Текст — что случилось, вид шахты и
// место: «Каменную шахту захватили — Асгард (q, r)» (04.11, §8.106; у гриба —
// его вид, игрок 25.10). Кнопка письма «Показать» — игра откроется на этой
// клетке (?mine=<строка>, castle-live/useMineLink); потерь несколько —
// «Добыча» со списком (?mine=list). Тоста в игре нет: уведомления — только
// в «Добыче», цифрой на кружке (владелец 04.11). Снос острова игрок делает
// сам — без письма (база сразу ставит notified_at).
//
//  • Кто отнял — ни в тексте, ни в событии (владелец: «будут разборки»).
//  • Живой канал (publishRaid «mineLost»): поток отдаёт событие только
//    прежнему хозяину (routes/api.beta-raid.events.ts) — «Добыча» и цифра на
//    кружке обновляются без F5.
//  • Письмо — ИГРОВЫМ ботом @yupland_heroes_bot (gameBotSendIfEnabled: кто
//    выключил уведомления — не пишем), язык игрока (userlang), кнопка — в игру.
//    В фоне: захват его не ждёт и от его сбоя не падает; ошибки — в лог,
//    токена бота в логе нет (tgGameBot его не печатает).
//  • Не спамим: строки отбирает база (raid_mine_lost_due) и тем же вызовом
//    ставит notified_at — повтор и второй процесс второй раз не шлют; игроку,
//    которому писали меньше минуты назад, — в следующий проход. Пачка игрока
//    (30 захватов за минуту) — одно письмо, по строке на каждую потерю.
//  • Когда: через KICK_MS после потери в этом процессе (захват, подъём,
//    разборка — kickMineLostNotify) и каждым минутным обходом поломок
//    (mine-break-sweep) — он же подбирает поломки и гниль грибов.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlStr } from "@/server/api/raid-shared";
import { lostDigest, lostText, type MineLostDigest } from "@/lib/mineLost";
import {
  lostDueSql,
  lostWorldsSql,
  notesByAccount,
  worldsOf,
} from "@/server/api/beta-raid/mine-lost/mine-lost-sql";

/** Строк за проход; остальное — следующим. */
const BATCH = 300;
/** Пауза после потери: пачка захватов подряд уходит одним письмом. */
const KICK_MS = 5_000;
/** Письма — порциями: у Bot API свои лимиты. */
const CHUNK = 25;
const GAP_MS = 250;

/** Telegram аккаунтов: из аккаунта, иначе из его кошельков (как письма подарков). */
export function tgOfSql(accounts: readonly string[]): string {
  return `SELECT a.id AS account_id,
            COALESCE(a.telegram_id,
              (SELECT u.telegram_id FROM yuplink.users u
                WHERE u.account_id = a.id AND u.telegram_id IS NOT NULL
                ORDER BY u.telegram_id LIMIT 1)) AS telegram_id
       FROM yuplink.accounts a
      WHERE a.id IN (${accounts.map((a) => sqlStr(a)).join(",")})`;
}

const esc = (s: string): string =>
  s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

/** Письма игрокам пачки — порциями, в фоне относительно вызвавшего. Не бросает на письме. */
async function mailAll(digests: Map<string, MineLostDigest>): Promise<void> {
  const rows = ((await mcpExec(tgOfSql([...digests.keys()]), { wrapJson: true })) ?? []) as Array<{
    account_id: string;
    telegram_id: number | string | null;
  }>;
  const targets = rows.filter((r) => r.telegram_id != null && digests.has(r.account_id));
  if (targets.length === 0) return;
  const { gameBotSendIfEnabled, gameLinkButton } = await import("@/server/tgGameBot");
  const { getUserLang } = await import("@/server/userLang");
  const { tFor } = await import("@/lib/i18n");
  /** Письмо одному игроку на его языке; кто выключил уведомления — не пишем. */
  const send = async (tgId: number, d: MineLostDigest): Promise<boolean> => {
    const lang = await getUserLang(tgId).catch(() => "ru" as const);
    const text = esc(lostText((k, p) => tFor(lang, k, p), d));
    const one = d.count === 1 ? d.notes[0]?.id : undefined;
    const button = gameLinkButton(tFor(lang, "minelost.show"), { mine: one ?? "list" });
    return gameBotSendIfEnabled(tgId, text, button).catch(() => false);
  };
  for (let i = 0; i < targets.length; i += CHUNK) {
    await Promise.all(
      targets
        .slice(i, i + CHUNK)
        .map((r) => send(Number(r.telegram_id), digests.get(r.account_id) as MineLostDigest)),
    );
    if (i + CHUNK < targets.length) await new Promise((res) => setTimeout(res, GAP_MS));
  }
}

/** Один проход: отобрать строки, тост каждому игроку, письма в фоне. Отдаёт, скольким. */
export async function notifyMineLosses(): Promise<number> {
  const byAcc = notesByAccount(await mcpExec(lostDueSql(BATCH), { wrapJson: true }));
  if (byAcc.size === 0) return 0;
  // Мир строки (§8.106); сбой — письмо без мира, но письмо.
  const ids = [...byAcc.values()].flat().flatMap((n) => (n.id ? [n.id] : []));
  const worlds = ids.length
    ? worldsOf(await mcpExec(lostWorldsSql(ids), { wrapJson: true }).catch(() => []))
    : new Map<string, string>();
  for (const n of [...byAcc.values()].flat()) {
    const w = n.id ? worlds.get(n.id) : undefined;
    if (w) n.world = w;
  }
  const digests = new Map<string, MineLostDigest>();
  for (const [account, notes] of byAcc) {
    const digest = lostDigest(notes);
    digests.set(account, digest);
    publishRaid({ type: "mineLost", mapId: null, to: account, digest });
  }
  void mailAll(digests).catch((e: unknown) =>
    console.warn("[mine-lost] письма:", e instanceof Error ? e.message : e),
  );
  return byAcc.size;
}

let running = false;

/** Проход без наложения в этом процессе; сбой — только в лог. */
export async function runMineLostNotify(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await notifyMineLosses();
  } catch (e) {
    console.warn("[mine-lost] уведомления:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

let kick: ReturnType<typeof setTimeout> | null = null;

/** После потери: проход через KICK_MS (пачка подряд — одним). Ничего не ждёт. */
export function kickMineLostNotify(): void {
  if (kick || typeof setTimeout !== "function") return;
  kick = setTimeout(() => {
    kick = null;
    void runMineLostNotify();
  }, KICK_MS);
  (kick as unknown as { unref?: () => void }).unref?.();
}
