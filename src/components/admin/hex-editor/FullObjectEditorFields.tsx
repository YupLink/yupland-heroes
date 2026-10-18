// Поля формы FullObjectEditor (картинки, превью, тип объекта, имя, локация,
// бейдж, HP, урон, стоимость) — вынесено отдельно, чтобы основной компонент
// не перевалил за лимит в 250 строк (§13 ПРАВИЛА.md). Чистая презентация:
// вся логика (handleSave/handleChangeType/handleUploadImage) остаётся в
// FullObjectEditor.tsx, сюда передаются только значения и колбэки.
import { ImagePlus, Swords, Zap } from "lucide-react";
import { BossLevelField } from "./BossLevelField";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { BossScene } from "@/components/game/BossScene";
import {
  OBJECT_SUBS,
  type ObjectSub,
  type TerrainDef,
} from "@/components/admin/hex-editor/hexShared";

export function FullObjectEditorFields({
  sub,
  meta,
  terrains,
  imageUrl,
  backgroundUrl,
  mapImageUrl,
  removeWhite,
  badgeLabel,
  name,
  land,
  maxHp,
  level,
  damage,
  interactionCost,
  onUploadImage,
  onClearBackground,
  onClearMapImage,
  onChangeType,
  onNameChange,
  onLandChange,
  onBadgeLabelChange,
  onMaxHpChange,
  onLevelChange,
  onDamageChange,
  onInteractionCostChange,
  onInteractionCostBlur,
}: {
  sub: ObjectSub;
  meta: (typeof OBJECT_SUBS)[number];
  terrains: TerrainDef[];
  imageUrl: string | null;
  backgroundUrl: string | null;
  mapImageUrl: string | null;
  removeWhite: boolean;
  badgeLabel: string | null;
  name: string;
  land: string;
  maxHp: number;
  /** Уровень босса 1..100; у прочих объектов уровня нет. */
  level: number;
  damage: string;
  interactionCost: number;
  onUploadImage: (field: "imageUrl" | "backgroundUrl" | "mapImageUrl") => void;
  onClearMapImage: () => void;
  onClearBackground: () => void;
  onChangeType: (target: (typeof OBJECT_SUBS)[number]) => void;
  onNameChange: (v: string) => void;
  onLandChange: (v: string) => void;
  onBadgeLabelChange: (v: string | null) => void;
  onMaxHpChange: (v: number) => void;
  onLevelChange: (v: number) => void;
  onDamageChange: (v: string) => void;
  onInteractionCostChange: (v: number) => void;
  onInteractionCostBlur: () => void;
}) {
  return (
    <>
      {/* Картинки */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Картинка
          </div>
          <button
            onClick={() => onUploadImage("imageUrl")}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50"
          >
            {imageUrl ? (
              <img src={thumb(imageUrl, 80)} alt="" className="h-9 w-9 rounded object-cover" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">{imageUrl ? "Сменить" : "Загрузить"}</span>
          </button>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Фон (GIF)
          </div>
          <button
            onClick={() => onUploadImage("backgroundUrl")}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50"
          >
            {backgroundUrl ? (
              <img src={thumb(backgroundUrl, 80)} alt="" className="h-9 w-9 rounded object-cover" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">{backgroundUrl ? "Сменить" : "Фон"}</span>
          </button>
          {backgroundUrl && (
            <button
              onClick={onClearBackground}
              className="mt-1 text-[10px] text-muted-foreground underline"
            >
              убрать
            </button>
          )}
        </div>
        <div>
          {/* Только для гекс-карты. Пусто — на карте берётся основная картинка. */}
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            На карте
          </div>
          <button
            onClick={() => onUploadImage("mapImageUrl")}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50"
          >
            {mapImageUrl ? (
              <img src={thumb(mapImageUrl, 80)} alt="" className="h-9 w-9 rounded object-cover" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              {mapImageUrl ? "Сменить" : "Как основная"}
            </span>
          </button>
          {mapImageUrl && (
            <button
              onClick={onClearMapImage}
              className="mt-1 text-[10px] text-muted-foreground underline"
            >
              убрать
            </button>
          )}
        </div>
      </div>

      {/* Превью */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Превью (как увидит игрок)
        </div>
        <BossScene
          imageUrl={imageUrl}
          backgroundUrl={backgroundUrl}
          removeWhite={removeWhite}
          locationBg={null}
          hpPct={100}
          isFinal={false}
          anim="breathe"
          label={badgeLabel}
        />
      </div>

      {/* Поля */}
      {/* Тип объекта — можно менять */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Тип объекта
        </div>
        <div className="flex gap-1">
          {OBJECT_SUBS.filter((s) => s.key !== "artifact").map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => onChangeType(s)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg border-2 py-2 text-xs font-bold transition",
                  sub === s.key
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border text-muted-foreground hover:border-gold/50",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={`Имя ${meta.label.toLowerCase()}`}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base"
      />
      <select
        value={land}
        onChange={(e) => onLandChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
      >
        <option value="">Локация (тип местности)</option>
        {terrains.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {/* Бейдж — выбор из списка + свой вариант */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Бейдж
        </div>
        <div className="flex flex-wrap gap-1">
          {["Босс", "Сундук", "Шахта", "Артефакт"].map((preset) => (
            <button
              key={preset}
              onClick={() => onBadgeLabelChange(preset)}
              className={cn(
                "rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition",
                badgeLabel === preset
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border text-muted-foreground hover:border-gold/50",
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          value={badgeLabel ?? ""}
          onChange={(e) => onBadgeLabelChange(e.target.value || null)}
          placeholder="Или свой текст"
          maxLength={40}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      {/* Уровень — только у боссов: сундуку и шахте его назначать нечему. */}
      {sub === "boss" && <BossLevelField level={level} onChange={onLevelChange} />}
      <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
        <span className="text-xs text-muted-foreground">HP</span>
        <input
          type="number"
          value={maxHp}
          onChange={(e) => onMaxHpChange(Number(e.target.value) || 1)}
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>

      {/* Что задано, то и бьёт: фикс — каждый раунд одинаково, диапазон —
          своё случайное число, пусто — эталонная формула с ростом. */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Урон за раунд
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
          <Swords className="h-4 w-4 text-destructive" />
          <input
            type="text"
            inputMode="numeric"
            value={damage}
            onChange={(e) => onDamageChange(e.target.value)}
            placeholder="250 или 10-1000 (пусто — эталон)"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        <div className="text-[10px] leading-snug text-muted-foreground">
          250 — ровно столько каждый раунд. 10-1000 — своё случайное число каждый раунд. Пусто —
          эталон: 80 и рост ×1,6 до 5-го раунда, разброс ±15%.
        </div>
      </div>

      {/* Стоимость взаимодействия */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Стоимость (энергия)
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
          <Zap className="h-4 w-4 text-yellow-400" />
          <input
            type="text"
            inputMode="numeric"
            value={interactionCost === 0 ? "" : String(interactionCost)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onInteractionCostChange(0);
                return;
              }
              const n = parseInt(raw, 10);
              if (!isNaN(n) && n >= 0) onInteractionCostChange(Math.max(1, n));
            }}
            onBlur={onInteractionCostBlur}
            placeholder="10"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
      </div>
    </>
  );
}
