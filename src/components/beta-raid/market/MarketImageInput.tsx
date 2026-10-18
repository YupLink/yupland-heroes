// Загрузчик картинки товара маркета (админ): превью + кнопка в /api/upload.
// Держит собственное состояние загрузки; отдаёт наверх только готовый URL.
// Вынесен из MarketItemForm, чтобы форма держалась в лимите ≤250 строк.
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

export function MarketImageInput({
  image,
  onImage,
}: {
  image: string | null;
  onImage: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "не загрузилось");
      onImage(json.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="flex items-center gap-2">
      {image ? (
        <img
          src={image}
          alt=""
          className="h-10 w-10 rounded-lg border border-border object-contain"
        />
      ) : null}
      <span className="flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold">
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Картинка
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </span>
    </label>
  );
}
