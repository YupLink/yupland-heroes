// Смена типа объекта (кнопки в FullObjectEditorFields) — вынесено отдельно,
// чтобы основной компонент уложился в лимит 250 строк (§13 ПРАВИЛА.md).
// Логика 1:1 из исходного инлайн-обработчика в admin.hex-editor.tsx: удаляем
// старую запись, создаём новую в другой таблице с полным переносом данных
// формы. interactionCost для боссов намеренно не отправляется — у
// boss-шаблонов нет этого поля, оно есть только у items (chest/mine).
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { adminCreateItem, adminDeleteItem } from "@/api";
import { adminSaveBossTemplate } from "@/server/api/raid-admin";
// Удаление шаблона живёт отдельно: копии на карте оно теперь не сиротит, а
// впечатывает в них снимок (raid-boss-templates + beta-raid/boss-snapshot).
import { adminDeleteBossTemplate } from "@/server/api/raid-boss-templates";
import { fromDraftCfg, type DraftConfig } from "@/components/admin/RewardConfigEditor";
import type { AbilityCfg } from "@/server/api/beta-raid/abilities";
import { OBJECT_SUBS, type ObjectSub } from "@/components/admin/hex-editor/hexShared";

export function createChangeObjectTypeHandler(args: {
  sub: ObjectSub;
  refId: string | undefined;
  metaLabel: string;
  qc: QueryClient;
  name: string;
  imageUrl: string | null;
  maxHp: number;
  rewardConfig: DraftConfig;
  backgroundUrl: string | null;
  mapImageUrl?: string | null;
  removeWhite: boolean;
  badgeLabel: string | null;
  land: string;
  abilities: AbilityCfg[];
  damage: string;
  interactionCost: number;
  /** «Убегает от игрока»: у босса это колонка, у предмета — meta.flees. */
  flees: boolean;
  onUpdated: () => void;
  setSaving: (v: boolean) => void;
}) {
  const {
    sub, refId, metaLabel, qc, name, imageUrl, maxHp, rewardConfig,
    backgroundUrl, mapImageUrl, removeWhite, badgeLabel, land, abilities, damage,
    interactionCost, flees, onUpdated, setSaving,
  } = args;

  return async (target: (typeof OBJECT_SUBS)[number]) => {
    if (target.key === sub) return; // Уже выбран
    if (!refId) return; // Новый объект — просто меняем тип
    // Смена типа: удаляем старый, создаём новый
    setSaving(true);
    try {
      // Удаляем из старой таблицы
      if (sub === "boss") {
        await adminDeleteBossTemplate({ data: { id: refId } });
      } else {
        await adminDeleteItem({ data: { id: refId } });
      }
      // Создаём в новой таблице с полным переносом данных
      if (target.key === "boss") {
        await adminSaveBossTemplate({
          data: {
            name: name || metaLabel,
            imageUrl,
            maxHp,
            rewardConfig: fromDraftCfg(rewardConfig),
            backgroundUrl,
            mapImageUrl: mapImageUrl ?? null,
            removeWhite,
            badgeLabel,
            land: land || undefined,
            abilities,
            damage: damage.trim() || null,
            flees,
          },
        });
      } else {
        // Для chest/mine — сохраняем всё в meta
        await adminCreateItem({
          data: {
            kind: target.key,
            name: name || metaLabel,
            imageUrl,
            land: land || undefined,
            meta: {
              backgroundUrl,
              mapImageUrl: mapImageUrl ?? null,
              badgeLabel,
              maxHp,
              rewardConfig: fromDraftCfg(rewardConfig),
              interactionCost,
              abilities,
              damage: damage.trim() || null,
              // Поведение принадлежит объекту, а не таблице, в которой он лежит:
              // мухомор остаётся убегающим и после переноса в сундуки.
              flees,
            },
          },
        });
      }
      toast.success(`Перенесено в ${target.label}`);
      qc.invalidateQueries({ queryKey: ["hex-editor-boss-templates"] });
      qc.invalidateQueries({ queryKey: ["hex-editor-items"] });
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };
}
