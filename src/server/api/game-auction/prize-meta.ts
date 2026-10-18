// Имя и картинка приза по его ссылке: лот показывает НАСТОЯЩЕЕ имя бокса/героя и
// его обложку, а не сырой cp_… . Паки — chip_packs/nft_packs, герои/артефакты —
// mystic_item_template, ресурсы — свои иконки. Разрешаем пачкой на весь список.
import { pg } from "../../db/pg";
import { rarityOfTemplateLevel } from "../heroes-list-dormant";
import { heroAbilityOf } from "@/lib/hero/heroAbilities";

/** Что за герой / артефакт: редкость, раса, спец, уровень, слот, прибавка. */
export type PrizeInfo = {
  rarity: string | null;
  race: string | null;
  spec: string | null;
  /** Способность героя (lib/hero/heroAbilities, §8.52); нет — null. */
  ability?: string | null;
  level: number | null;
  slot: string | null;
  statType: string | null;
  statAmount: number | null;
  /** Артефакт: прибавка к той же характеристике при расе/классе/земле героя. */
  raceAmount?: number | null;
  specAmount?: number | null;
  land?: string | null;
  landAmount?: number | null;
  immunities?: string[] | null;
  /** Бонус к рыбалке, % к шансу поимки. 0 — нет. */
  fishBonusPct?: number | null;
};

export type PrizeMeta = { name: string | null; image: string | null; info?: PrizeInfo };

const RES_META: Record<string, PrizeMeta> = {
  gold: { name: "Золото", image: "/resources/gold.webp" },
  stone: { name: "Камень", image: "/resources/stone.webp" },
  wood: { name: "Дерево", image: "/resources/wood.webp" },
  diamonds: { name: "Алмазы", image: "/resources/crystal.webp" },
};

type Ref = { prize_kind: string; prize_ref: string };

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v) || null);

/** Карта prize_ref → {name,image} для всех лотов списка (ключ — сам ref). */
export async function resolvePrizeMeta(rows: Ref[]): Promise<Map<string, PrizeMeta>> {
  const out = new Map<string, PrizeMeta>();
  const cp = new Set<string>();
  const pk = new Set<string>();
  const items = new Set<string>();
  for (const r of rows) {
    const ref = r.prize_ref;
    if (r.prize_kind === "resource") out.set(ref, RES_META[ref] ?? { name: ref, image: null });
    else if (r.prize_kind === "hero" || r.prize_kind === "artifact") items.add(ref);
    else if (ref.startsWith("pk_")) pk.add(ref);
    else cp.add(ref);
  }

  if (cp.size) {
    const { data } = await pg.chipPacks
      .raw()
      .select("id,name,cover_image_url")
      .in("id", [...cp]);
    for (const p of (data ?? []) as Array<{
      id: string;
      name: string;
      cover_image_url: string | null;
    }>) {
      out.set(p.id, { name: p.name, image: p.cover_image_url });
    }
  }
  if (pk.size) {
    const { data } = await pg.nftPacks
      .raw()
      .select("id,name,image_url")
      .in("id", [...pk]);
    for (const p of (data ?? []) as Array<{ id: string; name: string; image_url: string | null }>) {
      out.set(p.id, { name: p.name, image: p.image_url });
    }
  }
  if (items.size) {
    const { data } = await pg.mysticItemTemplates
      .raw()
      .select(
        "id,kind,name,image_url,rarity,race,specialization,level,slot,stat_type,stat_amount,race_amount,spec_amount,land,land_amount,immunities,fish_bonus_pct,meta",
      )
      .in("id", [...items]);
    for (const it of (data ?? []) as Array<{
      id: string;
      kind: string | null;
      name: string;
      image_url: string | null;
      rarity: string | null;
      race: string | null;
      specialization: string | null;
      level: number | null;
      slot: string | null;
      stat_type: string | null;
      stat_amount: number | null;
      race_amount: number | null;
      spec_amount: number | null;
      land: string | null;
      land_amount: number | null;
      immunities: unknown;
      fish_bonus_pct?: number | null;
      meta: unknown;
    }>) {
      out.set(it.id, {
        name: it.name,
        image: it.image_url,
        info: {
          // У шаблона героя редкость не хранится — она по звёздам (5★ легендарный,
          // 4★ эпический, 3★ редкий), как при создании экземпляра. Без этого
          // лот героя шёл без плашки редкости (жалоба 15.10.2026: «это лега?»).
          rarity: it.rarity || (it.kind === "hero" ? rarityOfTemplateLevel(it.level) : null),
          race: it.race,
          spec: it.specialization,
          ability: it.kind === "hero" ? heroAbilityOf(it.meta) : null,
          level: it.level,
          slot: it.slot,
          statType: it.stat_type,
          statAmount: it.stat_amount == null ? null : Number(it.stat_amount),
          raceAmount: num(it.race_amount),
          specAmount: num(it.spec_amount),
          land: it.land,
          landAmount: num(it.land_amount),
          immunities: Array.isArray(it.immunities)
            ? (it.immunities as unknown[]).filter((v): v is string => typeof v === "string" && !!v)
            : null,
          fishBonusPct: num(it.fish_bonus_pct),
        },
      });
    }
  }
  return out;
}
