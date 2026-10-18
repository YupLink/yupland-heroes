// Модалка «Новый / Правка» ассета любого слоя: имя + своя картинка.
import { destinations, label, type Destination } from "@/lib/castleMenus";
import { LabelSizeControl } from "./LabelSizeControl";
import { castleLabelSize } from "@/lib/castleLabelSize";
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import {
  castleEditorCreateAsset,
  castleEditorUpdateAsset,
} from "@/server/api/castle-editor-assets";
import { KIND_ONE, type Asset, type CastleKind } from "./types";

/** Один запрос — единственный источник картинки. Файл → URL. */
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  // 403 может прийти и голым текстом — не роняем r.json() в тост.
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (r.status === 403) throw new Error("Нет доступа к загрузке — войди заново через Telegram");
  if (!r.ok || !j.url) throw new Error(j.error ?? "Не удалось загрузить картинку");
  return j.url;
}

const HEX_CLIP = "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)";

export function AssetModal({
  kind,
  asset,
  onClose,
  onSaved,
  onDelete,
}: {
  kind: CastleKind;
  /** null — новый ассет; объект — правка. */
  asset: Asset | null;
  onClose: () => void;
  onSaved: (saved: Asset) => void;
  /** Удалить ассет (только в режиме правки). */
  onDelete: (a: Asset) => void;
}) {
  const [labelFontSize, setLabelFontSize] = useState(castleLabelSize(asset?.label_font_size));
  const [menuAction, setMenuAction] = useState<Destination | null>(asset?.menu_action ?? null);
  const [name, setName] = useState(asset?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(asset?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setUploading(true);
    try {
      setImageUrl(await uploadImage(f));
    } catch (e) {
      toast.error(humanError(e as Error));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Название обязательно");
    if (kind === "building" && name.trim().split(/\r?\n/).length > 2) return toast.error("В подписи можно оставить не больше двух строк");
    if (!imageUrl) return toast.error("Загрузите картинку");
    const labelSize = kind === "building" ? { labelFontSize, menuAction } : {};
    setSaving(true);
    try {
      if (asset) {
        await castleEditorUpdateAsset({
          data: { id: asset.id, name: name.trim(), imageUrl, ...labelSize },
        });
        toast.success("Обновлено");
        onSaved({
          ...asset,
          name: name.trim(),
          image_url: imageUrl,
          ...(kind === "building"
            ? { label_font_size: labelFontSize, menu_action: menuAction }
            : {}),
        });
      } else {
        const created = await castleEditorCreateAsset({
          data: { kind, name: name.trim(), imageUrl, ...labelSize },
        });
        toast.success("Добавлено");
        onSaved(created);
      }
    } catch (e) {
      toast.error(humanError(e as Error));
    } finally {
      setSaving(false);
    }
  };

  // Местность режем в гекс (это подложка), остальное — как есть (объект стоит
  // поверх, у него свой силуэт).
  const clip = kind === "terrain" ? HEX_CLIP : undefined;

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
          <span className="font-display text-lg font-bold">
            {asset ? "Правка" : "Добавить"} — {KIND_ONE[kind]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {kind === "building" ? <label className="block text-sm">
            Название и перенос строк
            <textarea value={name} onChange={(e) => setName(e.target.value)} rows={2} maxLength={60}
              aria-label="Название постройки" placeholder="Название"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm" autoFocus />
            <span className="mt-1 block text-xs text-muted-foreground">Enter — новая строка. До двух строк; слова не разрываются.</span>
          </label> : <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            autoFocus
          />}
          {kind === "building" && (
            <LabelSizeControl
              value={labelFontSize}
              onChange={setLabelFontSize}
              disabled={saving || uploading}
            />
          )}
          {kind === "building" && (
            <label className="block text-sm">
              Окно постройки
              <select
                className="mt-1 w-full rounded-lg border border-border bg-background p-2"
                value={menuAction ?? ""}
                disabled={saving || uploading}
                onChange={(e) => setMenuAction((e.target.value || null) as Destination | null)}
              >
                <option value="">Не назначено</option>
                {destinations.map((id) => (
                  <option key={id} value={id}>
                    {label(id, "ru")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-2">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background"
              style={clip ? { clipPath: clip } : undefined}
            >
              {imageUrl ? (
                <img src={thumb(imageUrl, 128)} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">без картинки</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {imageUrl ? "Заменить" : "Загрузить"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {asset && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Удалить «${asset.name}»? Снимется со всех клеток.`)) onDelete(asset);
              }}
              title="Удалить"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-destructive/40 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-secondary/40 py-2 text-sm"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || uploading}
            className="flex-1 rounded-xl bg-gold py-2 text-sm font-bold text-background disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
