// Токен окна оплаты Xsolla (Store API v3, admin/payment/token): товар по SKU, игрок —
// номер нашего аккаунта (его же Xsolla присылает в вебхуках). Только сервер.
import type { XsollaConfig } from "./xsollaConfig";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
/** Тёмная тема окна оплаты Xsolla. */
const DARK_THEME = "63295aab2e47fab76f7708e3";

export type TokenRequest = {
  account: string;
  sku: string;
  ip: string | null;
  lang: "ru" | "en";
  returnUrl: string;
};

export function tokenBody(cfg: XsollaConfig, r: TokenRequest): Record<string, unknown> {
  // Валюту Xsolla подбирает по стране: нет адреса IPv4 — страну игрок выберет сам.
  const country = r.ip && IPV4.test(r.ip) ? {} : { country: { value: "US", allow_modify: true } };
  return {
    sandbox: cfg.sandbox,
    user: { id: { value: r.account }, ...country },
    purchase: { items: [{ sku: r.sku, quantity: 1 }] },
    settings: {
      language: r.lang,
      return_url: r.returnUrl,
      redirect_policy: {
        redirect_conditions: "any",
        delay: 0,
        status_for_manual_redirection: "any",
        redirect_button_caption: r.lang === "ru" ? "Вернуться в игру" : "Back to the game",
      },
      ui: { theme: DARK_THEME },
    },
  };
}

export async function createPaymentToken(
  cfg: XsollaConfig,
  r: TokenRequest,
): Promise<{ token: string; orderId: number }> {
  const auth = Buffer.from(`${cfg.projectId}:${cfg.apiKey}`).toString("base64");
  const res = await fetch(
    `https://store.xsolla.com/api/v3/project/${cfg.projectId}/admin/payment/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(r.ip && IPV4.test(r.ip) ? { "X-User-Ip": r.ip } : {}),
      },
      body: JSON.stringify(tokenBody(cfg, r)),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const j = (await res.json().catch(() => ({}))) as {
    token?: unknown;
    order_id?: unknown;
    errorCode?: unknown;
    errorMessage?: unknown;
  };
  const orderId = Number(j.order_id);
  if (!res.ok || typeof j.token !== "string" || !Number.isSafeInteger(orderId) || orderId <= 0) {
    console.warn(
      `[xsolla] токен: ${res.status} ${String(j.errorCode ?? "")} ${String(j.errorMessage ?? "")}`,
    );
    throw new Error("card.failed");
  }
  return { token: j.token, orderId };
}
