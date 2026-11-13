// Узкий A/B-тест каталога подписок. Другие экраны и автосбор не затрагиваются.
// Публичный токен и EU ingestion host задаются конфигурацией сборки.
export const SUBSCRIPTION_FLAG = "yuplink-subscription-layout-v1";
export type SubscriptionLayout = "vertical" | "horizontal";
export type SubscriptionAssignment = {
  layout: SubscriptionLayout;
  distinctId: string | null;
  exposed: boolean;
};

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim() ?? "";
const host = import.meta.env.VITE_POSTHOG_API_HOST?.trim().replace(/\/$/, "") ?? "";
const configured = !!token && /^https:\/\/[^/]+$/.test(host);
const cache = new Map<string, { at: number; assignment: SubscriptionAssignment }>();
const DEFAULT: SubscriptionAssignment = { layout: "vertical", distinctId: null, exposed: false };

export async function subscriptionAssignment(distinctId: string | null): Promise<SubscriptionAssignment> {
  if (!configured || !distinctId) return DEFAULT;
  const cached = cache.get(distinctId);
  if (cached && Date.now() - cached.at < 300_000) return cached.assignment;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${host}/flags?v=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: token, distinct_id: distinctId }),
      signal: controller.signal,
    });
    if (!response.ok) return DEFAULT;
    const data = await response.json() as {
      errorsWhileComputingFlags?: boolean;
      flags?: Record<string, { enabled?: boolean; variant?: string }>;
    };
    if (data.errorsWhileComputingFlags) return DEFAULT;
    const flag = data.flags?.[SUBSCRIPTION_FLAG];
    const layout: SubscriptionLayout = flag?.enabled && (flag.variant === "horizontal" || flag.variant === "vertical")
      ? flag.variant : "vertical";
    const assignment: SubscriptionAssignment = { layout, distinctId, exposed: !!flag?.enabled && (flag.variant === "horizontal" || flag.variant === "vertical") };
    cache.set(distinctId, { at: Date.now(), assignment });
    return assignment;
  } catch {
    return DEFAULT;
  } finally {
    clearTimeout(timeout);
  }
}

export function trackSubscriptionEvent(
  assignment: SubscriptionAssignment,
  event: "$experiment_exposure" | "subscription_plan_selected" | "subscription_payment_methods_opened" | "subscription_purchase_completed",
  properties: Record<string, string | number> = {},
): void {
  if (!configured || !assignment.exposed || !assignment.distinctId) return;
  const exposure = event === "$experiment_exposure";
  const body = {
    api_key: token,
    distinct_id: assignment.distinctId,
    event,
    properties: {
      ...properties,
      ...(exposure ? { $feature_flag: SUBSCRIPTION_FLAG, $feature_flag_response: assignment.layout }
        : { [`$feature/${SUBSCRIPTION_FLAG}`]: assignment.layout, variant: assignment.layout }),
    },
  };
  void fetch(`${host}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {}); // Сбой аналитики не блокирует оплату.
}
