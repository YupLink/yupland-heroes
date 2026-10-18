// Скачать отмеченные картинки одним ZIP: тянем оригиналы по шесть разом, имена
// файлов — как в игре, папки — по категориям (makeArchivePaths), собираем архив
// в браузере (zipStore) и отдаём файлом. Сервер ничего не пакует — только
// отдаёт сами картинки, как и игре.
import { useRef, useState } from "react";
import { extOf, makeArchivePaths, type ArchiveItem } from "@/lib/mediaArchive";
import { buildZip } from "@/lib/zipStore";

const PARALLEL = 6;

export type ZipProgress = { running: boolean; done: number; total: number };

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Ссылку держим минуту: медленный диск ещё дописывает файл.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useArchiveZip() {
  const [progress, setProgress] = useState<ZipProgress>({ running: false, done: 0, total: 0 });
  const lastPaint = useRef(0);

  const run = async (items: ArchiveItem[]): Promise<{ saved: number; failed: number }> => {
    setProgress({ running: true, done: 0, total: items.length });
    const got: Array<{ item: ArchiveItem; data: Uint8Array; ext: string } | null> = new Array(
      items.length,
    ).fill(null);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i];
        try {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(String(res.status));
          const data = new Uint8Array(await res.arrayBuffer());
          got[i] = { item, data, ext: extOf(item.url, res.headers.get("content-type")) };
        } catch {
          got[i] = null;
        }
        done++;
        // Прогресс — не чаще пяти раз в секунду: тысяча перерисовок страницы
        // тормозила бы саму загрузку.
        const now = Date.now();
        if (now - lastPaint.current > 200 || done === items.length) {
          lastPaint.current = now;
          setProgress({ running: true, done, total: items.length });
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
      const ok = got.filter((g): g is NonNullable<typeof g> => g !== null);
      if (ok.length > 0) {
        const paths = makeArchivePaths(ok.map((g) => ({ item: g.item, ext: g.ext })));
        const blob = buildZip(ok.map((g, i) => ({ name: paths[i], data: g.data })));
        const day = new Date().toISOString().slice(0, 10);
        saveBlob(blob, `yuplink-images-${day}.zip`);
      }
      return { saved: ok.length, failed: items.length - ok.length };
    } finally {
      setProgress({ running: false, done: 0, total: 0 });
    }
  };

  return { progress, run };
}
