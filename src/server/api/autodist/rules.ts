// Правила авторассылок (владелец, 29.09.2026): у каждого источника денег —
// порог и режим. «Авто» — рассылка уходит сама, как только источник набрал
// порог (проверка раз в 5 минут и после каждой покупки подписки); «вручную» —
// только кнопкой.
//
//   sub_usd    — корзина $ подписок (USDT-оплаты и выведенные звёзды):
//                50 % обмен на DARAI (60 % пул карты / 40 % дупло), 50 % разработчикам;
//   sub_darai  — DARAI-оплаты подписок, порог по сумме оплат (корзины
//                «Сжечь» 15 % + «Разработчикам» 25 %);
//   darai_free — «Раздача DARAI» из «К распределению»: 50 % дупло, 12,5 %
//                Ярославу, 12,5 % Мише, 25 % держателям legendary;
//   auc_darai / auc_usd — выигрыши аукционов админа в DARAI / USDT: целиком
//                разработчикам по долям, порог по самой корзине (14.10).
//
// Хранится в yuplink.settings одной строкой JSON; битое поле — значение по
// умолчанию, поэтому сломать рассылку правкой настроек нельзя.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export const RULE_KEYS = ["sub_usd", "sub_darai", "darai_free", "auc_darai", "auc_usd"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export type AutoRule = { mode: "auto" | "manual"; threshold: number };
export type DevWallet = { wallet: string; share: number };

export type DistSettings = {
  rules: Record<RuleKey, AutoRule>;
  /** Кошельки разработчиков для подписок и их доли (в сумме 1). */
  devWallets: DevWallet[];
};

export const DIST_KEY = "energy_sub:dist";

export const DEFAULT_DIST: DistSettings = {
  rules: {
    sub_usd: { mode: "auto", threshold: 100 },
    sub_darai: { mode: "auto", threshold: 1_000_000_000 },
    // Прежняя раздача шла только кнопкой — автомат включает владелец сам.
    darai_free: { mode: "manual", threshold: 100_000_000 },
    auc_darai: { mode: "auto", threshold: 1_000_000_000 },
    auc_usd: { mode: "auto", threshold: 100 },
  },
  devWallets: [
    { wallet: "owner.example.tg", share: 0.5 },
    { wallet: "admin2.example.tg", share: 0.5 },
  ],
};

function parseRule(raw: unknown, legacy: { mode?: unknown; threshold?: unknown }, d: AutoRule): AutoRule {
  const o = (raw && typeof raw === "object" ? raw : legacy) as Record<string, unknown>;
  const t = Number(o.threshold);
  return { mode: o.mode === "auto" ? "auto" : o.mode === "manual" ? "manual" : d.mode, threshold: t > 0 ? t : d.threshold };
}

/** Настройки с защитой от мусора. Понимает и прежний плоский формат (usdThreshold …). */
export function parseDist(raw: unknown): DistSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rules = (o.rules && typeof o.rules === "object" ? o.rules : {}) as Record<string, unknown>;
  const wallets = Array.isArray(o.devWallets)
    ? (o.devWallets as DevWallet[]).filter(
        (w) => typeof w?.wallet === "string" && w.wallet.trim() && Number(w.share) > 0,
      )
    : [];
  const total = wallets.reduce((s, w) => s + Number(w.share), 0);
  return {
    rules: {
      sub_usd: parseRule(rules.sub_usd, { mode: o.usdMode, threshold: o.usdThreshold }, DEFAULT_DIST.rules.sub_usd),
      sub_darai: parseRule(
        rules.sub_darai,
        { mode: o.daraiMode, threshold: o.daraiThreshold },
        DEFAULT_DIST.rules.sub_darai,
      ),
      darai_free: parseRule(rules.darai_free, {}, DEFAULT_DIST.rules.darai_free),
      auc_darai: parseRule(rules.auc_darai, {}, DEFAULT_DIST.rules.auc_darai),
      auc_usd: parseRule(rules.auc_usd, {}, DEFAULT_DIST.rules.auc_usd),
    },
    devWallets:
      wallets.length && Math.abs(total - 1) < 1e-6
        ? wallets.map((w) => ({ wallet: w.wallet.trim(), share: Number(w.share) }))
        : DEFAULT_DIST.devWallets,
  };
}

/**
 * Сбой чтения — ошибка, а не значения по умолчанию: иначе выключенный
 * владельцем автомат на секунду сбоя базы включился бы сам.
 */
export async function loadDist(): Promise<DistSettings> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(DIST_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: string | null }> | null;
  try {
    return parseDist(JSON.parse(String(rows?.[0]?.value ?? "{}")));
  } catch {
    return DEFAULT_DIST;
  }
}

export async function saveDist(d: DistSettings): Promise<void> {
  const value = JSON.stringify(parseDist(d));
  await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(DIST_KEY)}, ${sqlStr(value)})
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
  );
}
