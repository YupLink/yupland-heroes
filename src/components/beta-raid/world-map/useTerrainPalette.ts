// Палитра местности карты мира: средние цвета плиток.
//
// Плитки грузятся тем же адресом, что у карты рейда (thumb 128): ответ
// /api/img кэшируется на год, так что второй раз это кэш браузера, а не сеть.
// Цвет считается один раз на адрес и живёт до перезагрузки страницы. Пока
// плитки нет — цвет по имени (fallbackTerrainColor), и карта видна сразу.
import { useEffect, useState } from "react";
import { thumb } from "@/lib/image";
import type { WorldMapTerrain } from "@/lib/raid/worldMapCodec";
import { queueImage } from "../imageQueue";
import { averageColor, buildPalette, fallbackTerrainColor, type Rgb } from "./terrainColors";

/** Палитра и словарь, под который она собрана: чужая палитра красила бы не те клетки. */
export type TerrainPalette = { terrains: readonly WorldMapTerrain[]; bytes: Uint8Array };

/** Адрес плитки → средний цвет; null — ещё грузится или не читается (тогда цвет по имени). */
const colors = new Map<string, Rgb | null>();
/** Кто ждёт новых цветов — любое открытое окно карты, даже если плитку заказало прежнее. */
const waiters = new Set<() => void>();
const SAMPLE = 16;

const tileUrl = (t: WorldMapTerrain): string => (t.img ? thumb(t.img, 128) : "");

function terrainColor(t: WorldMapTerrain): Rgb {
  return colors.get(tileUrl(t)) ?? fallbackTerrainColor(t.name);
}

function sample(img: HTMLImageElement): Rgb | null {
  try {
    const c = document.createElement("canvas");
    c.width = SAMPLE;
    c.height = SAMPLE;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    return averageColor(g.getImageData(0, 0, SAMPLE, SAMPLE).data);
  } catch {
    // Холст «испачкан» картинкой с чужого домена — остаётся цвет по имени.
    return null;
  }
}

function order(url: string): void {
  colors.set(url, null);
  const img = new Image();
  img.decoding = "async";
  img.addEventListener(
    "load",
    () => {
      colors.set(url, sample(img));
      for (const w of waiters) w();
    },
    { once: true },
  );
  queueImage(img, url);
}

export function useTerrainPalette(
  terrains: readonly WorldMapTerrain[] | undefined,
): TerrainPalette | null {
  const [palette, setPalette] = useState<TerrainPalette | null>(null);
  useEffect(() => {
    if (!terrains) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const repaint = () => setPalette({ terrains, bytes: buildPalette(terrains, terrainColor) });
    // Цвета доезжают пачкой: перекраска карты — раз на пачку, не на плитку.
    const onColor = () => {
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          repaint();
        }, 120);
      }
    };
    waiters.add(onColor);
    repaint();
    for (const t of terrains) {
      const url = tileUrl(t);
      if (url && !colors.has(url)) order(url);
    }
    return () => {
      waiters.delete(onColor);
      if (timer) clearTimeout(timer);
    };
  }, [terrains]);
  return palette;
}
