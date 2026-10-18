// Группа наград очереди для клейма «все одного типа».
//
// Раньше из очереди забиралось всё разом, и порядок задавала куча: в полный
// рюкзак влезало «что попало», а игрок не мог взять один нужный товар. Теперь
// клейм умеет сузиться до группы kind + pack_id — того же ключа, что рисует
// строку в окне «Добыча» (@/lib/rewardGroup).
//
// Чистая часть (фильтр SQL и валидатор входа) вынесена сюда, чтобы её можно
// было проверить тестом, не поднимая ручку с базой.
import { z } from "zod";
import { sqlStr } from "./raid-shared";

export type RewardGroup = { kind: string; packId: string | null };

/**
 * Вход ручки. kind — вид или символ токена (Darai, GDarai, USDT), поэтому
 * буквы с подчёркиванием, а не короткий перечень: мусор до SQL не доходит,
 * а незнакомый вид просто даст пустую выборку.
 */
export const rewardGroupInput = z.object({
  kind: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/),
  packId: z.string().min(1).max(128).nullable(),
});

/**
 * Хвост WHERE для группы. pack_id у лайков, энергии, билетов и токенов —
 * NULL: обычное `pack_id = NULL` молча вернуло бы пустоту, и «забрать все
 * лайки» отвечало бы «уже забрано». Отсюда IS NOT DISTINCT FROM.
 */
export function groupWhereSql(group: RewardGroup | null | undefined): string {
  if (!group) return "";
  const ref = group.packId == null ? "NULL" : sqlStr(group.packId);
  return ` AND reward_kind = ${sqlStr(group.kind)} AND pack_id IS NOT DISTINCT FROM ${ref}`;
}
