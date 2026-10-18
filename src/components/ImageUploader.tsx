// Reusable drag-n-drop загрузчик картинок.
// Используется в админских формах где нужна картинка (сундуки, уровни, …).
//
// Принимает текущий URL и onChange. При drop/select — POST'ит на /api/upload,
// получает {url} и зовёт onChange.

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
  shape?: "round" | "square";
  placeholder?: string;
}

// Сжатие картинки на клиенте до загрузки: ресайз до maxDim + пережатие.
// ВАЖНО: PNG/WebP пережимаем в WebP, а НЕ в JPEG — у JPEG нет альфа-канала,
// и прозрачный фон превращался в чёрный (артефакты 1024×1024 с чёрной
// подложкой на карте приехали именно отсюда). JPEG остаётся JPEG.
// SVG/GIF не трогаем (вектор/анимация). Любая ошибка → возвращаем исходник,
// чтобы не сломать загрузку на старых вебвью (Telegram/Xiaomi без части API).
async function compressImage(
  file: File,
  maxDim = 1024,
  quality = 0.85
): Promise<File> {
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  try {
    let w: number, h: number;
    let draw: (ctx: CanvasRenderingContext2D, dw: number, dh: number) => void;
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      w = bmp.width;
      h = bmp.height;
      draw = (ctx, dw, dh) => ctx.drawImage(bmp, 0, 0, dw, dh);
    } else {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = url;
        });
        w = img.naturalWidth;
        h = img.naturalHeight;
        draw = (ctx, dw, dh) => ctx.drawImage(img, 0, 0, dw, dh);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (!w || !h) return file;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    draw(ctx, dw, dh);
    // Картинка могла быть с прозрачностью — тогда только формат с альфой.
    const keepsAlpha = file.type !== "image/jpeg" && file.type !== "image/jpg";
    const wanted = keepsAlpha ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, wanted, quality)
    );
    // Старые вебвью могут не уметь webp — тогда toBlob отдаёт png. Берём то,
    // что реально вернулось, но альфу в JPEG не роняем ни при каких раскладах.
    if (!blob) return file;
    const outType = blob.type || wanted;
    if (keepsAlpha && outType === "image/jpeg") return file;
    if (blob.size >= file.size) return file; // не раздуваем
    const ext = outType === "image/webp" ? "webp" : outType === "image/png" ? "png" : "jpg";
    return new File([blob], file.name.replace(/\.\w+$/, "") + "." + ext, {
      type: outType,
    });
  } catch {
    return file;
  }
}

export function ImageUploader({
  value,
  onChange,
  className,
  shape = "square",
  placeholder = "Перетащи картинку сюда",
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useMutation({
    mutationFn: async (raw: File) => {
      if (!raw.type.startsWith("image/")) {
        throw new Error("Только изображения");
      }
      if (raw.size > 15 * 1024 * 1024) {
        throw new Error("Файл больше 15 МБ");
      }
      // Сжимаем ДО загрузки — навсегда, для всех форм: ресайз до 1024px +
      // пережатие в JPEG. Так хранимый файл заметно меньше и грузится быстрее
      // (арты/герои раньше висли). При ошибке — исходник (graceful).
      const file = await compressImage(raw);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { url: string };
      return j.url;
    },
    onSuccess: (url) => {
      onChange(url);
      toast.success("Загружено");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    upload.mutate(files[0]);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        style={
          value
            ? {
                backgroundImage: `url("${value.replace(/"/g, '\\"')}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
        className={cn(
          "relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed bg-secondary/30 transition",
          shape === "round" ? "rounded-full" : "rounded-xl",
          dragOver
            ? "border-gold bg-gold/10"
            : value
              ? "border-transparent"
              : "border-border hover:border-gold/40"
        )}
      >
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="absolute right-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            title="Удалить"
          >
            <X className="h-3 w-3" />
          </button>
        ) : upload.isPending ? (
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-[10px] text-muted-foreground">
            <Upload className="h-5 w-5" />
            <span>{placeholder}</span>
            <span className="opacity-60">или клик</span>
          </div>
        )}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] text-muted-foreground underline opacity-80 hover:opacity-100"
        >
          Удалить картинку
        </button>
      )}
    </div>
  );
}
