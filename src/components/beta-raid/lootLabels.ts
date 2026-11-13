// Человеческие подписи наград: в ответе сервера лежат технические ключи
// («tickets», «pack», «item», символ токена), а игроку нужен текст на его языке.
//
// `t` необязателен: без него всё остаётся по-русски, как было.

import type { TFn } from "./effectMeta";
import { rewardKindLabelKey } from "@/lib/rewardKinds";
import { goldForEarnedTickets } from "@/lib/ticketGold";

const KIND_KEY: Record<string, string> = {
  tickets: "braid.loot_tickets",
  likes: "braid.loot_likes",
  energy: "braid.loot_energy",
  pack: "braid.loot_pack",
  item: "braid.loot_item",
};

const KIND_RU: Record<string, string> = {
  tickets: "золота",
  likes: "лайк",
  energy: "энергия",
  pack: "пак",
  item: "предмет",
};

const kindWord = (kind: string, t?: TFn): string | undefined => {
  const key = KIND_KEY[kind];
  if (!key) return undefined;
  return t ? t(key) : KIND_RU[kind];
};

/**
 * «1000 Darai», «пак», «300 золота» (награда билетами — золотом ×100, ПРАВИЛА §8.61).
 * packId нужен для kind="resource" (золото/камень/…) и kind="custom".
 */
export function rewardLabel(
  reward: { kind: string; amount: number; packId?: string | null },
  t?: TFn,
): string {
  // resource и custom — через rewardKindLabelKey, который маппит packId →
  // конкретный ресурс и его перевод. Без packId вернёт null, fallback ниже.
  if (reward.kind === "resource" || reward.kind === "custom") {
    const key = rewardKindLabelKey(reward.kind, reward.packId ?? undefined);
    if (key) {
      const word = t ? t(key) : key;
      return reward.amount > 1 ? `${reward.amount} ${word}` : word;
    }
  }
  const known = kindWord(reward.kind, t);
  if (reward.kind === "pack" || reward.kind === "item") return known ?? reward.kind;
  if (!known) return `${reward.amount} ${reward.kind}`; // токен: «1000 Darai»
  if (reward.kind === "tickets") return `${goldForEarnedTickets(reward.amount)} ${known}`;
  return `${reward.amount} ${known}`;
}

export function rewardsLine(
  rewards: Array<{ kind: string; amount: number; packId?: string | null }>,
  t?: TFn,
): string {
  return rewards.map((r) => rewardLabel(r, t)).join(", ");
}
