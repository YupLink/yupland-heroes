import { useState } from "react";
import { thumb } from "@/lib/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImagePlus } from "lucide-react";

// ─── Картинка типа местности: перетащить или выбрать ───
//
// Вынесено из TerrainEditor (§13.1): там остались поля и сохранение. Логика
// при переносе не менялась — только переехала вместе со своим состоянием
// (превью и «перетаскивают прямо сейчас»).
export function TerrainImagePicker({
  initialUrl,
  onUploaded,
}: {
  /** Уже сохранённая картинка — показываем её, пока не выбрали новую. */
  initialUrl: string | null;
  /** Ссылка на загруженный файл; редактор сохранит её при «Сохранить». */
  onUploaded: (url: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialUrl);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Нужна картинка");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
      onUploaded(j.url);
      // Превью — из локального файла: залитый URL может ещё не раздаваться.
      setImageUrl(URL.createObjectURL(f));
      toast.success("Загружено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  };

  const pickFile = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) handleUpload(f);
    };
    inp.click();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleUpload(f);
      }}
      onClick={pickFile}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 transition",
        dragOver ? "border-gold bg-gold/10" : "border-border hover:border-gold/50",
      )}
    >
      {imageUrl ? (
        <img
          src={thumb(imageUrl, 96)}
          alt=""
          className="h-16 w-16 rounded object-cover"
          style={{ clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" }}
        />
      ) : (
        <ImagePlus className="h-8 w-8 text-muted-foreground" />
      )}
      <span className="text-xs text-muted-foreground">
        {imageUrl ? "Нажми чтобы сменить" : "Перетащи картинку или нажми"}
      </span>
    </div>
  );
}
