// Курс DARAI к $ для подсказки в админке: сколько выйдет в USDT / DARAI / Stars
// у тарифа в $ (тот же кэш Ref, что у подписки и витрины).
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../auth";
import { daraiPerUsd } from "./energy-sub/rate";

export const adminUsdRate = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const r = await daraiPerUsd();
  return r ? { daraiPerUsd: r.rate, ageMs: r.ageMs } : null;
});
