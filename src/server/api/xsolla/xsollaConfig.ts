// Настройки Xsolla (владелец, 11.11.2026, §8.127): ключи — только на сервере
// (/opt/golden-drop/.env, сборка зашивает их в серверную часть). Только сервер.
import { mcpExec } from "../../db/mcpClient";

export type XsollaConfig = {
  projectId: string;
  apiKey: string;
  secret: string;
  /** Тестовый режим: окно sandbox, выдача — только тестовым аккаунтам. */
  sandbox: boolean;
};

/** null — ключей нет, оплата картой выключена. */
export function xsollaConfig(): XsollaConfig | null {
  const projectId = (process.env.XSOLLA_PROJECT_ID ?? "").trim();
  const apiKey = (process.env.XSOLLA_API_KEY ?? "").trim();
  const secret = (process.env.XSOLLA_WEBHOOK_SECRET ?? "").trim();
  if (!/^\d+$/.test(projectId) || !apiKey || !secret) return null;
  return { projectId, apiKey, secret, sandbox: (process.env.XSOLLA_SANDBOX ?? "1").trim() !== "0" };
}

export const TEST_ACCOUNTS_KEY = "xsolla_test_accounts";

/** Аккаунты, которым открыт тестовый режим (settings, JSON-массив id). */
export async function xsollaTestAccounts(): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = '${TEST_ACCOUNTS_KEY}'`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: string }>;
  try {
    const list = JSON.parse(rows?.[0]?.value ?? "[]") as unknown;
    return new Set(
      Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** Можно ли этому аккаунту платить картой сейчас: живой режим — да, тестовый — по списку. */
export async function cardOpenFor(cfg: XsollaConfig, account: string): Promise<boolean> {
  return !cfg.sandbox || (await xsollaTestAccounts()).has(account);
}
