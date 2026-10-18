// Загрузка картинки объекта в редакторе (основная, фон, картинка для карты).
//
// Вынесено из FullObjectEditor: файл стоял у лимита в 250 строк, а §13.1
// требует декомпозицию ПЕРЕД следующей правкой. Логика перенесена дословно.
import { toast } from "sonner";

export type ImageField = "imageUrl" | "backgroundUrl" | "mapImageUrl";

type Setter = (url: string) => void;

/**
 * Открывает выбор файла и кладёт загруженный URL в нужное поле формы.
 * Возврат — готовый обработчик кнопки «Загрузить».
 */
export function makeImageUploader(image: Setter, mapImage: Setter, background: Setter) {
  const set: Record<ImageField, Setter> = {
    imageUrl: image,
    mapImageUrl: mapImage,
    backgroundUrl: background,
  };
  return async (field: ImageField) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const j = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
        set[field](j.url);
        toast.success("Загружено");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
      }
    };
    inp.click();
  };
}
