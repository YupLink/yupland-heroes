// Курс DARAI к $ для окон: звездочнику цены в DARAI показываются в звёздах
// (lib/starsForDarai.ts). Открыто всем — это просто публичная цена (кэш Ref).
import { createServerFn } from "@tanstack/react-start";
import { daraiRate } from "./darai-stars";

export const getDaraiRate = createServerFn({ method: "GET" }).handler(async () => ({
  daraiPerUsd: await daraiRate(),
}));
