// Отказ в сборе добычи — с причиной, сроком и на языке игрока.
//
// Глухое «Уже собрано — возвращайся позже» не объясняло ничего: игрок видел
// активную кнопку «Собрать · 0.16 лайков» и отказ без срока (жалоба
// игрока 29.08). Сроки знает сервер, а словари живут на клиенте —
// поэтому строку собираем здесь, готовой. Приём тот же, что у ввода NFT
// (playerLang в chips-mint-deposit-verify.ts): язык берём из Accept-Language.
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Lang } from "@/lib/store";
import { dict as chipsDict } from "@/lib/translations/chips";

/** Правило то же, что в store.ts: русскоязычная локаль → ru, иначе en. */
function playerLang(): Lang {
  try {
    const h = (getRequestHeader("accept-language") ?? "").toLowerCase();
    if (!h) return "ru";
    return /\b(ru|be|uk|kk|ky|hy|az|uz|tg|mo)\b/.test(h) ? "ru" : "en";
  } catch {
    return "ru";
  }
}

function say(key: string, params?: Record<string, string | number>): string {
  const lang = playerLang();
  let s = chipsDict[key]?.[lang] ?? chipsDict[key]?.ru ?? key;
  for (const [k, v] of Object.entries(params ?? {})) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** «3 ч 20 мин» / «3 h 20 min» — fmtRemain из chips-utils, но двумя языками. */
export function fmtRemainFor(ms: number): string {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 1) return say("chips.dur_lt_min");
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? say("chips.dur_hm", { h, m }) : say("chips.dur_h", { h });
  return say("chips.dur_m", { m });
}

/** Кулдаун: сбор был недавно, называем срок. */
export function miningCooldownText(remainMs: number): string {
  return say("chips.mine_cooldown", { t: fmtRemainFor(remainMs) });
}

/**
 * Окно занято чужим сбором. Почти всегда это уже прошедший сбор (в том числе
 * с соседнего кошелька того же аккаунта) — тогда у игрока есть срок, и мы его
 * называем. Настоящая гонка двух сестёр — единственный случай, когда сказать
 * нечего, кроме «подожди»: состояние ещё не дописано параллельным запросом.
 */
export async function miningWindowTakenText(
  wallet: string,
  nowMs: number,
  cooldownMs: number,
): Promise<string> {
  const { getMiningState } = await import("./chips-mint-helpers-mining");
  const fresh = await getMiningState(wallet).catch(() => null);
  const last = fresh?.lastClaimAtMs ?? 0;
  const remain = last > 0 ? last + cooldownMs - nowMs : 0;
  if (remain > 0) return miningCooldownText(remain);
  return say("chips.mine_busy");
}
