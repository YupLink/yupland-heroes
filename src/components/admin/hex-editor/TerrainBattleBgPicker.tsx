// Фон окна боя У ТИПА МЕСТНОСТИ.
//
// Раньше фон задавался каждому боссу отдельно, и это работало, пока боссов
// ставили руками по одному. Массовая раскладка выбирает сразу десяток типов
// местности — одного фона на всех там нет и быть не может. Поэтому фон
// назначается местности: встал в горах — горный, встал в аду — адский.
//
// Хранится в `meta.battleBgUrl` шаблона местности; читает его сервер боя
// (server/api/beta-raid/cell-override.ts).
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { thumb } from "@/lib/image";

export function TerrainBattleBgPicker({
  value,
  onChange,
}: {
  /** Уже сохранённый фон боя или null. */
  value: string | null;
  /** Новый адрес картинки; null — «фона нет, вернуть поведение по умолчанию». */
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const pickFile = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
        onChange(j.url);
        toast.success("Загружено");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        setBusy(false);
      }
    };
    inp.click();
  };

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Фон боя</span>
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2 py-1 text-xs disabled:opacity-50"
        >
          {value ? (
            <img src={thumb(value, 80)} alt="" className="h-7 w-7 rounded object-cover" />
          ) : (
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          )}
          <span>{busy ? "Загружаю…" : value ? "Сменить" : "Загрузить"}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Убрать фон"
            className="rounded p-1 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Объясняем правило прямо в форме: иначе «поставил фон, а у босса свой» */}
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        Подставляется в окно боя объектам на этой местности, у которых свой фон не задан.
      </p>
    </div>
  );
}
