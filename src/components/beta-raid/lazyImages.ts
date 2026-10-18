// Картинки карты — по требованию кадра.
//
// Раньше вход на карту сразу ставил в очередь картинки ВСЕХ объектов, декора и
// построек мира (07.10.2026: 435 штук, 3,9 МБ), а то, что на экране, ждало в
// общей очереди: постройки в центре появлялись на 9–15-й секунде даже на
// хорошем канале, на медленном — через минуту. Теперь картинка заводится
// сразу, но качаться начинает, когда кадр впервые её попросил (get): первый
// кадр тянет только видимое, сдвиг камеры — то, что въехало в кадр.
//
// Снаружи это обычный Map: рисовальщики берут картинку через get и проверяют
// complete && naturalWidth > 0 — незапущенная картинка для них «ещё грузится»,
// как и прежде.
import { queueImage } from "./imageQueue";

export class LazyImages extends Map<string, HTMLImageElement> {
  /** Заведены, но ещё не запрошены кадром: ключ → адрес. */
  private readonly pending = new Map<string, string>();

  /** Завести картинку, качать — при первом get. */
  defer(key: string, img: HTMLImageElement, url: string): void {
    super.set(key, img);
    this.pending.set(key, url);
  }

  override get(key: string): HTMLImageElement | undefined {
    const img = super.get(key);
    if (img) {
      const url = this.pending.get(key);
      if (url !== undefined) {
        this.pending.delete(key);
        queueImage(img, url);
      }
    }
    return img;
  }

  override delete(key: string): boolean {
    this.pending.delete(key);
    return super.delete(key);
  }

  /** Сколько заведено, но ни разу не понадобилось кадру (для проверки). */
  get idle(): number {
    return this.pending.size;
  }
}
