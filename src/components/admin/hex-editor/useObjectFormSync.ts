// Синхронизация полей формы FullObjectEditor с загруженными данными
// (шаблон босса или item) — вынесено в хук, чтобы основной компонент
// уложился в лимит 250 строк (§13 ПРАВИЛА.md). Логика 1:1 из исходного
// useEffect в admin.hex-editor.tsx.
import { useEffect } from "react";
import { toDraftCfg, type DraftConfig, type RewardConfig } from "@/components/admin/RewardConfigEditor";
import type { AbilityCfg } from "@/server/api/beta-raid/abilities";
import type { adminListBossTemplates } from "@/server/api/raid-admin";
import type { adminListItems } from "@/api";
import type { CellObjectConfig } from "@/server/api/beta-raid/admin-live-read";

type BossTemplate = Awaited<ReturnType<typeof adminListBossTemplates>>["templates"][number];
type Item = Awaited<ReturnType<typeof adminListItems>>[number];

export function useObjectFormSync(
  bossTpl: BossTemplate | undefined,
  item: Item | undefined,
  metaLabel: string,
  setters: {
    setName: (v: string) => void;
    setImageUrl: (v: string | null) => void;
    setMaxHp: (v: number) => void;
    setLevel: (v: number) => void;
    setRewardConfig: (v: DraftConfig) => void;
    setBackgroundUrl: (v: string | null) => void;
    setRemoveWhite: (v: boolean) => void;
    setMapImageUrl: (v: string | null) => void;
    setBadgeLabel: (v: string | null) => void;
    setLand: (v: string) => void;
    setInteractionCost: (v: number) => void;
    setAbilities: (v: AbilityCfg[]) => void;
    setDamage: (v: string) => void;
    /** «Убегает от игрока» — у босса колонка, у предмета meta.flees. */
    setFlees: (v: boolean) => void;
  },
  /**
   * Правки этого объекта на конкретной клетке. Шаблон — только заготовка:
   * если клетку уже настраивали, форма должна открыться с её значениями,
   * иначе сохранение вернёт эталон и затрёт настройку.
   */
  cellConfig?: CellObjectConfig | null,
) {
  const {
    setName, setImageUrl, setMaxHp, setLevel, setRewardConfig, setBackgroundUrl, setMapImageUrl,
    setRemoveWhite, setBadgeLabel, setLand, setInteractionCost, setAbilities, setDamage, setFlees,
  } = setters;

  useEffect(() => {
    if (bossTpl) {
      setName(bossTpl.name);
      setImageUrl(bossTpl.imageUrl);
      setMaxHp(bossTpl.maxHp);
      setLevel((bossTpl as { level?: number }).level ?? 1);
      setRewardConfig(toDraftCfg(bossTpl.rewardConfig));
      setBackgroundUrl((bossTpl as { backgroundUrl?: string | null }).backgroundUrl ?? null);
      setMapImageUrl((bossTpl as { mapImageUrl?: string | null }).mapImageUrl ?? null);
      setRemoveWhite((bossTpl as { removeWhite?: boolean }).removeWhite ?? false);
      setBadgeLabel((bossTpl as { badgeLabel?: string | null }).badgeLabel ?? null);
      setLand((bossTpl as { land?: string }).land ?? "");
      setInteractionCost((bossTpl as { interactionCost?: number }).interactionCost ?? 10);
      setAbilities((bossTpl as { abilities?: AbilityCfg[] }).abilities ?? []);
      setDamage(String((bossTpl as { damage?: string | null }).damage ?? ""));
      setFlees((bossTpl as { flees?: boolean }).flees === true);
    }
    if (item) {
      setName(item.name);
      setImageUrl(item.imageUrl);
      setLand(item.land ?? "");
      // Загружаем данные из meta (если были перенесены из босса)
      const itemMeta = item.meta as Record<string, unknown> | null;
      if (itemMeta && typeof itemMeta === "object") {
        if (itemMeta.backgroundUrl !== undefined) setBackgroundUrl(itemMeta.backgroundUrl as string | null);
        if (itemMeta.mapImageUrl !== undefined) setMapImageUrl(itemMeta.mapImageUrl as string | null);
        if (itemMeta.badgeLabel !== undefined) setBadgeLabel(itemMeta.badgeLabel as string | null);
        if (itemMeta.maxHp !== undefined) setMaxHp(itemMeta.maxHp as number);
        if (itemMeta.rewardConfig !== undefined) setRewardConfig(toDraftCfg(itemMeta.rewardConfig as RewardConfig));
        if (itemMeta.interactionCost !== undefined) setInteractionCost(itemMeta.interactionCost as number);
        if (itemMeta.abilities !== undefined) setAbilities((itemMeta.abilities as AbilityCfg[]) ?? []);
        if (itemMeta.damage !== undefined) setDamage(String(itemMeta.damage ?? ""));
        setFlees(itemMeta.flees === true);
      }
    }
    if (cellConfig) {
      if (cellConfig.maxHp !== undefined) setMaxHp(cellConfig.maxHp as number);
      if (cellConfig.interactionCost !== undefined)
        setInteractionCost(cellConfig.interactionCost as number);
      if (cellConfig.badgeLabel !== undefined) setBadgeLabel(cellConfig.badgeLabel as string | null);
      if (cellConfig.rewardConfig !== undefined) setRewardConfig(toDraftCfg(cellConfig.rewardConfig));
    }
  }, [bossTpl, item, metaLabel, cellConfig]);
}
