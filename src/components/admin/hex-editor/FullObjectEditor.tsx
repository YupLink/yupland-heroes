// Полный редактор объекта (босс/сундук/шахта/артефакт). Вынесено из
// admin.hex-editor.tsx при декомпозиции (§13 ПРАВИЛА.md). Состояние и вся
// логика (handleSave/handleChangeType/handleUploadImage) живут здесь; JSX
// полей формы и список шаблонов вынесены в соседние файлы, чтобы уложиться
// в лимит 250 строк на файл.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { adminListItems, adminUpdateItem, adminCreateItem } from "@/api";
import { adminListBossTemplates, adminSaveBossTemplate } from "@/server/api/raid-admin";
import { adminListRewardTokens } from "@/server/api/boss";
import { RewardConfigEditor, type DraftConfig, DEF_CFG, toDraftCfg, fromDraftCfg, rewardDraftReady } from "@/components/admin/RewardConfigEditor";
import { AbilitiesEditor } from "@/components/admin/hex-editor/AbilitiesEditor";
import type { AbilityCfg } from "@/server/api/beta-raid/abilities";
import { OBJECT_SUBS, type ObjectSub, type TerrainDef } from "@/components/admin/hex-editor/hexShared";
import { FullObjectEditorTemplates as Templates } from "@/components/admin/hex-editor/FullObjectEditorTemplates";
import { FullObjectEditorFields as Fields } from "@/components/admin/hex-editor/FullObjectEditorFields";
import { FullObjectEditorFooter as Footer } from "@/components/admin/hex-editor/FullObjectEditorFooter";
import { FleeToggle } from "@/components/admin/hex-editor/FleeToggle";
import { makeImageUploader } from "@/components/admin/hex-editor/uploadObjectImage";
import { useObjectFormSync } from "@/components/admin/hex-editor/useObjectFormSync";
import { createChangeObjectTypeHandler } from "@/components/admin/hex-editor/changeObjectType";
import type { CellObjectConfig } from "@/server/api/beta-raid/admin-live-read";

type BossTemplate = Awaited<ReturnType<typeof adminListBossTemplates>>["templates"][number];

// ─── Полный редактор объекта (босс/сундук/шахта/артефакт) ───
/** onSaveToCell — записать правки в ЭТУ клетку карты (шаблон не трогаем). */
export function FullObjectEditor({ sub, refId, cellKey, onClose, onUpdated, onSaveToCell, terrains, cellConfig }: {
  sub: ObjectSub; refId?: string; cellKey: string; onClose: () => void; onUpdated: () => void;
  onSaveToCell?: (cfg: Record<string, unknown> | null) => void; terrains: TerrainDef[];
  /** Уже сохранённые правки этой клетки — форма открывается с ними. */
  cellConfig?: CellObjectConfig | null;
}) {
  const qc = useQueryClient();
  const meta = OBJECT_SUBS.find((s) => s.key === sub) ?? OBJECT_SUBS[0];
  const bossTpls = useQuery({ queryKey: ["hex-editor-boss-templates"], queryFn: () => adminListBossTemplates() });
  const itemsQ = useQuery({ queryKey: ["hex-editor-items", sub], queryFn: () => adminListItems({ data: { kind: sub } }) });
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });

  const bossTpl = bossTpls.data?.templates?.find((t) => t.id === refId);
  const item = itemsQ.data?.find((i) => i.id === refId);

  const [name, setName] = useState(bossTpl?.name ?? item?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(bossTpl?.imageUrl ?? item?.imageUrl ?? null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>((bossTpl as { backgroundUrl?: string | null })?.backgroundUrl ?? null);
  // Картинка только для гекс-карты (в окне боя не участвует).
  const [mapImageUrl, setMapImageUrl] = useState<string | null>((bossTpl as { mapImageUrl?: string | null })?.mapImageUrl ?? null);
  const [removeWhite, setRemoveWhite] = useState((bossTpl as { removeWhite?: boolean })?.removeWhite ?? false);
  const [badgeLabel, setBadgeLabel] = useState<string | null>((bossTpl as { badgeLabel?: string | null })?.badgeLabel ?? meta.label);
  const [maxHp, setMaxHp] = useState(bossTpl?.maxHp ?? 100000);
  const [level, setLevel] = useState((bossTpl as { level?: number })?.level ?? 1);
  const [interactionCost, setInteractionCost] = useState((bossTpl as { interactionCost?: number })?.interactionCost ?? (item as { interactionCost?: number })?.interactionCost ?? 10);
  const [rewardConfig, setRewardConfig] = useState<DraftConfig>(bossTpl ? toDraftCfg(bossTpl.rewardConfig) : DEF_CFG);
  const [land, setLand] = useState((bossTpl as { land?: string })?.land ?? item?.land ?? "");
  const [abilities, setAbilities] = useState<AbilityCfg[]>((bossTpl as { abilities?: AbilityCfg[] })?.abilities ?? []);
  const [damage, setDamage] = useState<string>(String((bossTpl as { damage?: string | null })?.damage ?? ""));
  // «Убегает»: подошёл вплотную — объект уходит дальше (server flee-move).
  const [flees, setFlees] = useState((bossTpl as { flees?: boolean })?.flees ?? false);
  const [saving, setSaving] = useState(false);
  const [showTpl, setShowTpl] = useState(false);

  // Обновляем стейт когда данные загрузятся (см. useObjectFormSync.ts).
  useObjectFormSync(bossTpl, item, meta.label, {
    setName, setImageUrl, setMaxHp, setLevel, setRewardConfig, setBackgroundUrl, setMapImageUrl,
    setRemoveWhite, setBadgeLabel, setLand, setInteractionCost, setAbilities, setDamage, setFlees,
  }, cellConfig);

  // Правка живёт на этом объекте карты: шаблон — только заготовка.
  const handleSaveToCell = () => {
    if (!onSaveToCell || !rewardDraftReady(rewardConfig)) return;
    onSaveToCell({ maxHp, interactionCost, badgeLabel: badgeLabel ?? undefined, rewardConfig: fromDraftCfg(rewardConfig) });
    toast.success("Сохранено для этого объекта на карте");
    onClose();
  };

  const handleSave = async () => {
    if (!rewardDraftReady(rewardConfig)) return; // молча выбросить награду нельзя
    setSaving(true);
    try {
      if (sub === "boss") {
        await adminSaveBossTemplate({
          data: {
            id: refId && refId !== "new" ? refId : undefined, // Если refId есть и не "new" — обновляем
            name: name || meta.label,
            imageUrl,
            maxHp,
            rewardConfig: fromDraftCfg(rewardConfig),
            backgroundUrl,
            mapImageUrl,
            removeWhite,
            badgeLabel,
            land: land || undefined,
            level,
            flees,
            abilities,
            damage: damage.trim() || null,
          },
        });
        toast.success(refId && refId !== "new" ? "Босс обновлён" : "Босс создан");
        qc.invalidateQueries({ queryKey: ["hex-editor-boss-templates"] });
      } else {
        // Для chest/mine — сохраняем дополнительные данные в meta
        const itemMeta = {
          backgroundUrl,
          mapImageUrl,
          badgeLabel,
          maxHp,
          rewardConfig: fromDraftCfg(rewardConfig),
          interactionCost,
          abilities,
          damage: damage.trim() || null,
          // У предмета своей колонки нет — флаг лежит в meta (flee-cells.ts
          // читает оба места одним запросом).
          flees,
        };
        if (refId && refId !== "new") {
          await adminUpdateItem({
            data: {
              id: refId,
              name,
              imageUrl,
              land: land || undefined,
              meta: itemMeta,
            },
          });
          toast.success("Сохранено");
        } else {
          await adminCreateItem({
            data: {
              kind: sub,
              name: name || meta.label,
              imageUrl,
              land: land || undefined,
              meta: itemMeta,
            },
          });
          toast.success("Создано");
        }
        qc.invalidateQueries({ queryKey: ["hex-editor-items"] });
      }
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  // Загрузка картинок — в uploadObjectImage.ts (§13.1: файл был у лимита).
  const handleUploadImage = makeImageUploader(setImageUrl, setMapImageUrl, setBackgroundUrl);

  // Применить шаблон босса к текущей форме (кнопка «Взять» в FullObjectEditorTemplates).
  const handlePickTemplate = (t: BossTemplate) => {
    setName(t.name);
    setImageUrl(t.imageUrl);
    setMaxHp(t.maxHp);
    setRewardConfig(toDraftCfg(t.rewardConfig));
    setBackgroundUrl((t as { backgroundUrl?: string | null }).backgroundUrl ?? null);
    setMapImageUrl((t as { mapImageUrl?: string | null }).mapImageUrl ?? null);
    setRemoveWhite((t as { removeWhite?: boolean }).removeWhite ?? false);
    setBadgeLabel((t as { badgeLabel?: string | null }).badgeLabel ?? null);
    setLand((t as { land?: string }).land ?? "");
    setAbilities((t as { abilities?: AbilityCfg[] }).abilities ?? []);
    setDamage(String((t as { damage?: string | null }).damage ?? ""));
    setLevel((t as { level?: number }).level ?? 1);
    setFlees((t as { flees?: boolean }).flees ?? false);
    setShowTpl(false);
    toast.success("Шаблон загружен");
  };

  // Смена типа объекта (кнопки в FullObjectEditorFields) — логика вынесена в
  // changeObjectType.ts, см. комментарий там про interactionCost у боссов.
  const handleChangeType = createChangeObjectTypeHandler({
    sub, refId, metaLabel: meta.label, qc, name, imageUrl, maxHp, rewardConfig,
    backgroundUrl, mapImageUrl, removeWhite, badgeLabel, land, abilities, damage,
    interactionCost, flees, onUpdated, setSaving,
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gold/30 bg-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <meta.icon className="h-5 w-5" style={{ color: meta.color }} />
          <span className="font-display text-lg font-bold">Правка: {meta.label}</span>
          <span className="ml-1 text-[10px] text-muted-foreground">Клетка: {cellKey}</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* Шаблоны */}
          <Templates
            templates={bossTpls.data?.templates ?? []}
            show={showTpl}
            onToggleShow={() => setShowTpl(!showTpl)}
            onPick={handlePickTemplate}
          />

          <Fields
            sub={sub}
            meta={meta}
            terrains={terrains}
            imageUrl={imageUrl}
            backgroundUrl={backgroundUrl}
            mapImageUrl={mapImageUrl}
            onClearMapImage={() => setMapImageUrl(null)}
            removeWhite={removeWhite}
            badgeLabel={badgeLabel}
            name={name}
            land={land}
            maxHp={maxHp}
            level={level}
            onLevelChange={setLevel}
            damage={damage}
            interactionCost={interactionCost}
            onUploadImage={handleUploadImage}
            onClearBackground={() => setBackgroundUrl(null)}
            onChangeType={handleChangeType}
            onNameChange={setName}
            onLandChange={setLand}
            onBadgeLabelChange={setBadgeLabel}
            onMaxHpChange={setMaxHp}
            onDamageChange={setDamage}
            onInteractionCostChange={setInteractionCost}
            onInteractionCostBlur={() => { if (!interactionCost || interactionCost < 1) setInteractionCost(10); }}
          />

          {/* «Убегает» — свойство шаблона, а не клетки (см. FleeToggle). */}
          <FleeToggle value={flees} onChange={setFlees} disabled={sub === "mine"} />
          {/* Способности — босс/сундук/шахта настраиваются одинаково; можно оставить пустым */}
          <AbilitiesEditor value={abilities} onChange={setAbilities} />

          {/* Награды */}
          {/* allowExtras/allowUsdt — только тут: ресурс и товар выдаёт тракт карты, USDT сверяет usdt-guard. */}
          <RewardConfigEditor cfg={rewardConfig} onChange={setRewardConfig} tokens={tokens.data ?? []} allowTickets={false} chipPacksOnly allowExtras allowUsdt />
        </div>

        <Footer
          saving={saving}
          onCancel={onClose}
          onSaveToCell={onSaveToCell ? handleSaveToCell : undefined}
          onSaveTemplate={handleSave}
        />
      </div>
    </div>
  );
}
