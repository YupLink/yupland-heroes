// SVG-холст интерьера. Проходы: (1) подложка всех клеток + клик; (2) слои
// одиночных клеток поверх ВСЕЙ подложки (иначе сосед справа/снизу закрашивал
// бы край здания своей местностью); (3) объединённые блоки — слои один раз на
// весь прямоугольник блока; (4) обводки выделения/блоков поверх картинок.
// Порядок слоёв: местность → дорога → декор → объект → постройка.
import { Fragment, useMemo } from "react";
import { CastleBuildingLabels } from "./CastleBuildingLabels";
import { thumb } from "@/lib/image";
import {
  CANVAS_H,
  CANVAS_W,
  COLS,
  HEX_SIZE,
  ROWS,
  cellKey,
  groupBox,
  hexCenter,
  hexPolygonPoints,
} from "./hexGeom";
import { clampIconScale } from "@/lib/mergeScale";
import type { Asset, CastleCell, CellMap } from "./types";

const OVERLAY_ORDER: Array<keyof Omit<CastleCell, "terrainId" | "groupId" | "iconScale">> = [
  "roadId",
  "decorationId",
  "objectId",
  "buildingId",
];

const ALL_KEYS: string[] = [];
for (let r = 0; r < ROWS; r += 1) for (let q = 0; q < COLS; q += 1) ALL_KEYS.push(cellKey(q, r));

export function CastleCanvas({
  cells,
  assetById,
  selected,
  activeGroup,
  onCellClick,
  camera,
  labelForCell,
  calmTerrain = false,
}: {
  calmTerrain?: boolean;
  camera?: { width: number; height: number; viewBox: string };
  labelForCell?: (key: string) => string | undefined;
  cells: CellMap;
  assetById: Map<string, Asset>;
  selected: Set<string>;
  /** Блок, выбранный в режиме объединения — подсвечиваем ярче. */
  activeGroup: string | null;
  onCellClick: (key: string) => void;
}) {
  const terrainStyle = calmTerrain ? { filter: "saturate(0.7) contrast(0.9) brightness(0.98)" } : undefined;
  // Блоки: groupId → клетки. Считаем один раз на изменение клеток.
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [k, c] of Object.entries(cells)) {
      if (!c.groupId) continue;
      const list = m.get(c.groupId) ?? [];
      list.push(k);
      m.set(c.groupId, list);
    }
    return m;
  }, [cells]);

  // The live camera can look beyond the editable 16×16 map. Continue its
  // terrain there so the HUD and resource rail sit over landscape, not gaps.
  const surroundingTerrain = useMemo(() => {
    if (!camera) return [];
    const [x, y, w, h] = camera.viewBox.split(/\s+/).map(Number);
    const rowStart = Math.floor((y - HEX_SIZE) / (HEX_SIZE * 1.5)) - 2;
    const rowEnd = Math.ceil((y + h - HEX_SIZE) / (HEX_SIZE * 1.5)) + 2;
    const colStart = Math.floor((x - HEX_SIZE) / (HEX_SIZE * Math.sqrt(3))) - 2;
    const colEnd = Math.ceil((x + w - HEX_SIZE) / (HEX_SIZE * Math.sqrt(3))) + 2;
    const result: Array<{ q: number; r: number }> = [];
    for (let r = rowStart; r <= rowEnd; r += 1) {
      for (let q = colStart; q <= colEnd; q += 1) {
        if (q < 0 || q >= COLS || r < 0 || r >= ROWS) result.push({ q, r });
      }
    }
    return result;
  }, [camera?.viewBox]);
  const fallbackTerrain = useMemo(
    () => Object.values(cells).find((cell) => cell.terrainId)?.terrainId ?? null,
    [cells],
  );

  // Через ресайз-прокси: на холсте гекс 68 px, оригинал 3000×3000 ни к чему.
  const imgOf = (id: string | null, w: number): string | null => {
    const u = id ? (assetById.get(id)?.image_url ?? null) : null;
    return u ? thumb(u, w) : null;
  };
  const centerOf = (key: string): [number, number] => {
    const [q, r] = key.split(",").map(Number);
    return hexCenter(q, r);
  };

  return (
    <svg
      width={camera?.width ?? CANVAS_W}
      height={camera?.height ?? CANVAS_H}
      viewBox={camera?.viewBox ?? `0 0 ${CANVAS_W} ${CANVAS_H}`}
      style={{ display: "block", background: "#141418" }}
    >
      {surroundingTerrain.map(({ q, r }) => {
        const cx = HEX_SIZE * Math.sqrt(3) * (q + (Math.abs(r) % 2) / 2) + HEX_SIZE;
        const cy = HEX_SIZE * 1.5 * r + HEX_SIZE;
        const sourceQ = Math.min(COLS - 1, Math.max(0, q));
        const sourceR = Math.min(ROWS - 1, Math.max(0, r));
        const terrainId = cells[cellKey(sourceQ, sourceR)]?.terrainId ?? fallbackTerrain;
        const terrain = imgOf(terrainId, 256);
        const clipId = `castle-surround-${q}-${r}`;
        return <g key={clipId} pointerEvents="none">
          {terrain ? <>
            <defs><clipPath id={clipId}><polygon points={hexPolygonPoints(cx, cy)} /></clipPath></defs>
            <image href={terrain} style={terrainStyle} x={cx - HEX_SIZE} y={cy - HEX_SIZE} width={HEX_SIZE * 2} height={HEX_SIZE * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          </> : <polygon points={hexPolygonPoints(cx, cy)} fill="#34552c" />}
          <polygon points={hexPolygonPoints(cx, cy)} fill="transparent" stroke="#2d2d33" strokeWidth={1} />
        </g>;
      })}
      {/* Проход 1: подложка + сетка + клик */}
      {ALL_KEYS.map((key) => {
        const [cx, cy] = centerOf(key);
        const cell = cells[key];
        const terrain = imgOf(cell?.terrainId ?? null, 256);
        const clipId = `castle-hex-${key.replace(",", "-")}`;
        return (
          <g
            key={key}
            onClick={() => onCellClick(key)}
            style={{ cursor: "pointer" }}
            role={labelForCell?.(key) ? "button" : undefined}
            tabIndex={labelForCell?.(key) ? 0 : undefined}
            aria-label={labelForCell?.(key)}
            onKeyDown={(e) => {
              if (labelForCell?.(key) && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onCellClick(key);
              }
            }}
          >
            {terrain ? (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <polygon points={hexPolygonPoints(cx, cy)} />
                  </clipPath>
                </defs>
                <image
                  href={terrain}
                  style={terrainStyle}
                  x={cx - HEX_SIZE}
                  y={cy - HEX_SIZE}
                  width={HEX_SIZE * 2}
                  height={HEX_SIZE * 2}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                />
              </>
            ) : (
              <polygon points={hexPolygonPoints(cx, cy)} fill={cell ? "#2a2a31" : "#1c1c22"} />
            )}
            <polygon
              points={hexPolygonPoints(cx, cy)}
              fill="transparent"
              stroke="#2d2d33"
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Проход 2: слои одиночных клеток — поверх всей подложки, слой за слоем */}
      {OVERLAY_ORDER.map((f) =>
        Object.entries(cells).map(([key, cell]) => {
          if (cell.groupId) return null;
          const src = imgOf(cell[f], 256);
          if (!src) return null;
          const [cx, cy] = centerOf(key);
          return (
            <image
              key={`${f}:${key}`}
              href={src}
              x={cx - HEX_SIZE}
              y={cy - HEX_SIZE}
              width={HEX_SIZE * 2}
              height={HEX_SIZE * 2}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: "none" }}
            />
          );
        }),
      )}

      {/* Проход 3: объединённые блоки — слои один раз на весь прямоугольник,
          картинка растёт от центра блока на iconScale (1…2) */}
      {[...groups.entries()].map(([gid, keys]) => {
        const lead = cells[keys[0]];
        if (!lead) return null;
        const box = groupBox(keys);
        const s = clampIconScale(lead.iconScale);
        const w = box.w * s;
        const h = box.h * s;
        const x = box.x - (w - box.w) / 2;
        const y = box.y - (h - box.h) / 2;
        return (
          <Fragment key={gid}>
            {OVERLAY_ORDER.map((f) => {
              const src = imgOf(lead[f], 512);
              return src ? (
                <image
                  key={f}
                  href={src}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: "none" }}
                />
              ) : null;
            })}
          </Fragment>
        );
      })}

      {/* Проход 4: обводки — выделение и блоки поверх всех картинок */}
      {ALL_KEYS.map((key) => {
        const isSel = selected.has(key);
        const gid = cells[key]?.groupId ?? null;
        if (camera || (!isSel && !gid)) return null;
        const isActive = !!gid && gid === activeGroup;
        const [cx, cy] = centerOf(key);
        return (
          <polygon
            key={`o:${key}`}
            points={hexPolygonPoints(cx, cy)}
            fill={isSel || isActive ? "#a78bfa33" : "transparent"}
            stroke={isSel || isActive ? "#a78bfa" : "#7c3aedaa"}
            strokeWidth={isSel || isActive ? 3 : 2}
            style={{ pointerEvents: "none" }}
          />
        );
      })}
      <CastleBuildingLabels cells={cells} assetById={assetById} groups={groups} />
    </svg>
  );
}
