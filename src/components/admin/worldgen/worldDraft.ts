// Черновик формы нового мира и выбор доли суши (списком, не вводом).
export type WorldDraft = {
  name: string;
  seedText: string;
  kind: "map" | "endless";
  size: 128 | 256;
  /** Суша, %; null — как в исходном квадрате живой карты. */
  landPct: number | null;
  /** Земли мира; null — все земли живой карты. */
  lands: string[] | null;
};

export const LAND_CHOICES: ReadonlyArray<number | null> = [null, 30, 50, 70, 90];
