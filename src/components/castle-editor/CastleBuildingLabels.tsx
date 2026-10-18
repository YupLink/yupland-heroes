import { CANVAS_W, groupBox } from "./hexGeom";
import { castleLabelSize } from "@/lib/castleLabelSize";
import type { Asset, CellMap } from "./types";
import "./castleLabels.css";

/** Высота плашки в одну строку: рамка 1+1, отступы 4+5, строка 20, pb обёртки 2. */
const PLAQUE_H = 33;
/** Conservative word width for Russo One at 20 px. */
const CHAR_W = 12.5;

/** The catalogue name is the label; edits reuse the existing asset save/cache flow. */
export function CastleBuildingLabels({
  cells,
  assetById,
  groups,
}: {
  cells: CellMap;
  assetById: Map<string, Asset>;
  groups: Map<string, string[]>;
}) {
  const sites = Object.entries(cells)
    .filter(([, cell]) => !cell.groupId)
    .map(([key]) => ({ id: key, keys: [key] }));
  for (const [id, keys] of groups) sites.push({ id, keys });
  const labels = sites.flatMap(({ id, keys }) => {
    const buildingId = cells[keys[0]]?.buildingId;
    const asset = buildingId ? assetById.get(buildingId) : undefined;
    const name = asset?.kind === "building" ? asset.name.trim() : "";
    const box = groupBox(keys);
    return name
      ? [
          {
            id,
            name,
            scale: castleLabelSize(asset?.label_font_size) / 20,
            cx: box.x + box.w / 2,
            bottom: box.y + box.h,
          },
        ]
      : [];
  });

  return (
    <g className="pointer-events-none" data-castle-labels="">
      {labels.map(({ id, name, scale, cx, bottom }) => {
        // Keep centered even at the edge. The plaque grows upwards from the site bottom.
        // Самое длинное слово целиком: «Тренировочный» (≈180 при шрифте 20) в
        // 146 рвалось посреди слова — перенос только между словами.
        const longest = Math.max(...(name.includes("\n") ? name.split(/\r?\n/) : name.split(/\s+/)).map((w) => w.length));
        const wordW = (longest * CHAR_W + 20) * scale;
        let width = Math.min(Math.max(146 * scale, wordW), cx * 2, (CANVAS_W - cx) * 2);
        for (const other of labels) {
          // Пересечение — по реальной высоте плашки (33 px), а не по коробке
          // foreignObject в 54 px: иначе диагональные соседи (ряды через 51 px)
          // считались пересекающимися и ужимались до нечитаемых 25 px.
          const overlaps =
            bottom > other.bottom - PLAQUE_H * other.scale &&
            other.bottom > bottom - PLAQUE_H * scale;
          if (other.id !== id && overlaps && other.cx !== cx)
            width = Math.min(width, Math.max(40 * scale, wordW, Math.abs(other.cx - cx) - 4));
        }
        return (
          <g
            key={id}
            transform={`translate(${cx} ${bottom}) scale(${scale})`}
            data-label-anchor={id}
          >
            <foreignObject
              x={-width / (2 * scale)}
              y={-54}
              width={width / scale}
              height={54}
              data-building-label={id}
            >
              <div className="flex h-full items-end justify-center px-px pb-[2px]">
                <div
                  className="castle-building-label max-w-full rounded-[2px] border border-[#9d8859] bg-[#302b23] px-[9px] pt-[4px] pb-[5px] text-center text-[20px] leading-[20px] font-normal text-[#fff0cc]"
                  title={name}
                  aria-label={name}
                >
                  <span className={name.includes("\n") ? "block whitespace-pre" : "line-clamp-2 [overflow-wrap:normal] [word-break:normal]"}>{name}</span>
                </div>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}
