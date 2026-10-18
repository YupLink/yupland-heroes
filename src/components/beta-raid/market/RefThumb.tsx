// Картинка шаблона в пикере товара.
//
// Через уменьшающий прокси: в сетке карточка шириной около полутора сотен
// пикселей, а лежат там полноразмерные арты — сотня таких грузилась секундами
// и на телефоне заметно тормозила открытие списка.
//
// `loading=lazy` докладывает то же самое: до прокрутки нижние карточки вообще
// не запрашиваются.
import { ImageOff } from "lucide-react";
import { thumb } from "@/lib/image";

export function RefThumb({ image, size = 160 }: { image: string | null; size?: number }) {
  if (!image)
    return (
      <div className="grid aspect-square w-full place-items-center rounded-lg border border-border text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  return (
    <img
      src={thumb(image, size)}
      alt=""
      loading="lazy"
      decoding="async"
      className="aspect-square w-full rounded-lg border border-border object-contain"
    />
  );
}
