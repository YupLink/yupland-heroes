import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminUpdateItem, adminCreateItem, adminListItems } from "@/api";
import { Mountain, X } from "lucide-react";
import { TerrainImagePicker } from "@/components/admin/hex-editor/TerrainImagePicker";
import { TerrainBattleBgPicker } from "@/components/admin/hex-editor/TerrainBattleBgPicker";
import type { TerrainDef } from "@/components/admin/hex-editor/hexShared";
import { AdminTagChecks } from "@/components/beta-raid/AdminTagChecks";
import { AdminDecorInteract } from "@/components/beta-raid/AdminDecorInteract";

/** jsonb приезжает как unknown: копию делаем только из настоящего объекта. */
function metaRecord(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return { ...(meta as Record<string, unknown>) };
}

/** Уровень местности (meta.level) для поля: нет — пусто. */
function levelOf(meta: unknown): string {
  const raw = metaRecord(meta).level;
  return typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
}

/** Фон боя из meta шаблона: пустая строка — это «не задан». */
function battleBgOf(meta: unknown): string | null {
  const raw = metaRecord(meta).battleBgUrl;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

// ─── Редактор типов местности (попап) ───
export function TerrainEditor({
  terrain,
  kind,
  onClose,
  onSaved,
}: {
  terrain: TerrainDef | null;
  kind: "terrain" | "road" | "decoration";
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(terrain?.label ?? "");
  const [cost, setCost] = useState(terrain?.cost ?? 1);
  const [costStr, setCostStr] = useState(String(terrain?.cost ?? 1));
  const [originalUrl] = useState<string | null>(terrain?.file || null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  // Фон окна боя — свойство МЕСТНОСТИ, а не каждого босса на ней.
  const [battleBg, setBattleBg] = useState<string | null>(battleBgOf(terrain?.meta));
  // Уровень местности: автораздача может ставить мобов только на уровни n–n.
  const [level, setLevel] = useState(levelOf(terrain?.meta));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error("Название обязательно");
      return;
    }
    setSaving(true);
    try {
      // meta шлём ЦЕЛИКОМ (adminUpdateItem её перезаписывает, а не сливает),
      // поэтому базу берём СВЕЖУЮ с сервера, а не из пропса: список, из
      // которого нас открыли, собирается без meta (дороги, декор) — чужие
      // поля молча обнулились бы при первой же правке названия.
      const baseMeta = terrain?.id
        ? metaRecord(
            (await adminListItems({ data: { kind } })).find((i) => i.id === terrain.id)?.meta ??
              terrain.meta,
          )
        : metaRecord(terrain?.meta);
      // Для terrain/road: используем uploadedUrl если новый, иначе
      // оригинальный. Декор — визуал, цены хода у него нет.
      const finalImageUrl = uploadedUrl ?? originalUrl;
      // Фон боя есть только у местности; у дорог и декора боя не бывает.
      if (kind === "terrain") {
        if (battleBg) baseMeta.battleBgUrl = battleBg;
        else delete baseMeta.battleBgUrl;
        const lv = Number.parseInt(level, 10);
        if (Number.isFinite(lv) && lv >= 0) baseMeta.level = Math.min(1000, lv);
        else delete baseMeta.level;
      }
      // Для местности meta шлём ВСЕГДА, даже пустую: adminUpdateItem трогает
      // её только когда поле пришло, и снятый фон иначе остался бы в базе.
      const metaToSend =
        kind === "terrain" || Object.keys(baseMeta).length > 0 ? baseMeta : undefined;
      const statAmount = kind === "decoration" ? undefined : cost;
      if (terrain?.id) {
        // Редактирование существующего.
        await adminUpdateItem({
          data: {
            id: terrain.id,
            name: label.trim(),
            imageUrl: finalImageUrl ?? undefined,
            statAmount,
            meta: metaToSend,
          },
        });
        toast.success("Обновлено");
      } else {
        // Создание нового.
        await adminCreateItem({
          data: {
            kind: kind,
            name: label.trim(),
            imageUrl: finalImageUrl ?? undefined,
            statAmount,
            meta: metaToSend,
          },
        });
        toast.success(
          kind === "road"
            ? "Дорога создана"
            : kind === "decoration"
              ? "Декор создан"
              : "Тип местности создан",
        );
      }
      qc.invalidateQueries({ queryKey: ["hex-editor-items", kind] });
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Mountain className="h-5 w-5 text-gold" />
          <span className="font-display text-lg font-bold">
            {terrain
              ? `Правка ${kind === "road" ? "дороги" : kind === "decoration" ? "декора" : "местности"}`
              : `Новый тип ${kind === "road" ? "дороги" : kind === "decoration" ? "декора" : "местности"}`}
          </span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Название (Дерево, Куст...)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            autoFocus
          />
          {kind !== "decoration" && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-xs text-muted-foreground">Цена хода</span>
              <input
                type="text"
                value={costStr}
                onChange={(e) => {
                  const v = e.target.value;
                  setCostStr(v);
                  // Пробуем парсить сразу
                  const n = parseFloat(v.replace(",", "."));
                  if (!isNaN(n) && n >= 0.1) setCost(Math.round(n * 10) / 10);
                }}
                onBlur={() => {
                  const v = costStr.replace(",", ".");
                  const n = parseFloat(v);
                  if (isNaN(n) || n < 0.1) {
                    setCostStr("1");
                    setCost(1);
                  } else {
                    setCostStr(String(Math.round(n * 10) / 10));
                    setCost(Math.round(n * 10) / 10);
                  }
                }}
                placeholder="1.3"
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>
          )}
          <TerrainImagePicker initialUrl={originalUrl} onUploaded={setUploadedUrl} />
          {kind === "terrain" && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-xs text-muted-foreground">Уровень</span>
              <input
                type="text"
                inputMode="numeric"
                value={level}
                onChange={(e) => setLevel(e.target.value.replace(/\D/g, ""))}
                placeholder="1"
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>
          )}
          {kind === "terrain" && <TerrainBattleBgPicker value={battleBg} onChange={setBattleBg} />}
          {/* Метки декора: местности и расы (галочки сохраняются сразу). */}
          {kind === "decoration" && terrain?.id && (
            <>
              <AdminTagChecks refId={terrain.id} kind="decoration" />
              <AdminDecorInteract decorId={terrain.id} />
            </>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-secondary/40 py-2 text-sm"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl gradient-gold py-2 font-bold text-gold-foreground disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
