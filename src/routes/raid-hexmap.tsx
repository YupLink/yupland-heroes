// Прототип: масштабная гекс-карта рейда (визуальный апгрейд карты, которая
// сейчас есть в /chips → Рейд → «Вся карта»). Строится из РЕАЛЬНЫХ данных
// (adminListRaidLocations — то же, чем управляет /admin/raids), ничего не
// придумывает по структуре: локации/боссы/развилки/переходы — как в БД.
//
// Не в навигации, не в BetaGate-allowlist специально — служебная страница
// для одного показа владельцу, доступ только админам (как и остальная
// админка). Прямая ссылка: /raid-hexmap.
//
// Гекс-сетка (flat-top), формулы — стандартные (redblobgames):
//   pixel.x = R * 3/2 * q
//   pixel.y = R * sqrt(3) * (r + q/2)
// Замок — центр (0,0). 6 граней = 6 направлений для «изначальных дорог».
// Развилка — точка ветвления: продолжение в той же локации ТОЖЕ считается
// одной из веток (наравне с дочерними локациями), т.к. в данных именно так
// устроено (после fork-узла ordinal может продолжаться в этой же локации).
// «Портал»: если fork ведёт в локацию, которая уже физически размещена на
// карте (реальный кейс в текущих данных — «Адские места» достижимы и из
// «Пустыня Смерти», и из «Гиблое место») — рисуем пунктирную дугу вместо
// второй копии её цепочки боссов.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/api/user-auth";
import { adminListRaidLocations } from "@/server/api/raid-admin";

export const Route = createFileRoute("/raid-hexmap")({
  head: () => ({
    meta: [
      { title: "Гекс-карта рейда" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RaidHexMapPage,
});

// ──────────────────────────── Гекс-геометрия ────────────────────────────

const R = 54; // circumradius гекса, px в SVG-координатах
const SQRT3 = Math.sqrt(3);

type Axial = { q: number; r: number };

// flat-top: 6 соседей по часовой, индекс 0 = вправо.
const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function axialKey(a: Axial): string {
  return `${a.q},${a.r}`;
}
function axialToPixel(a: Axial): { x: number; y: number } {
  return { x: R * 1.5 * a.q, y: R * SQRT3 * (a.r + a.q / 2) };
}
function neighborOf(a: Axial, dirIdx: number): Axial {
  const d = DIRS[((dirIdx % 6) + 6) % 6];
  return { q: a.q + d.q, r: a.r + d.r };
}
// Точки гекса (flat-top) вокруг локального центра (0,0).
const HEX_POINTS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i);
  return `${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`;
}).join(" ");

// ──────────────────────────── Терраины ────────────────────────────

const TERRAIN_FILES = [
  "01_water.webp",
  "02_snow.webp",
  "03_grass.webp",
  "04_rough.webp",
  "05_sand.webp",
  "06_dirt.webp",
  "07_swamp.webp",
  "08_wasteland.webp",
  "09_lava.webp",
  "10_subterranean.webp",
  "11_highland.webp",
];
const TERRAIN_KEYWORDS: Array<[RegExp, string]> = [
  [/сне(г|ж)|зим|лёд|ice|winter/i, "02_snow.webp"],
  [/болот|swamp/i, "07_swamp.webp"],
  [/пустын|desert|песок|sand/i, "05_sand.webp"],
  [/ад(ские)?|лав|инферно|огне|fire|lava|hell/i, "09_lava.webp"],
  [/подземел|пещер|dungeon|cave/i, "10_subterranean.webp"],
  [/гор[аеы]|highland|mountain|взгорь/i, "11_highland.webp"],
  [/пустош|wasteland|бесплодн/i, "08_wasteland.webp"],
  [/гибл|безум|rough|скал/i, "04_rough.webp"],
  [/вода|озеро|остров|water|lake/i, "01_water.webp"],
  [/лес|forest|древ/i, "03_grass.webp"],
  [/земл|dirt|поле/i, "06_dirt.webp"],
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pickTerrain(name: string): string {
  for (const [re, file] of TERRAIN_KEYWORDS) if (re.test(name)) return file;
  return TERRAIN_FILES[hashStr(name) % TERRAIN_FILES.length];
}
// .webp вместо .png — те же 11 картинок, ~320KB вместо ~1.9MB суммарно
// (см. public/terrains/README.md). terrain-имена в TERRAIN_FILES остаются
// .png (используются и как ключ в TERRAIN_COLOR), тут просто меняем
// расширение на отдачу.
const terrainUrl = (file: string) => `/terrains/${file.replace(/\.png$/, ".webp")}`;

// Портреты боссов — ~90 РАЗНЫХ картинок (не как террайн, тут схлопнуть в
// 11 нельзя), и часть загружены на полном разрешении: до 250KB на штуку
// при том что в гексе рисуется кусок ~45px. В проекте уже есть готовый
// ресайз-прокси (src/routes/api.img.ts) — гоняет через sharp, жмёт в webp,
// кэширует на диске с длинным Cache-Control. До сих пор им не пользовались
// для карты — теперь портрет качается один раз ~5-15KB вместо ~250KB,
// причём тем же самым файлом для ВСЕХ, кто зайдёт после.
function bossImgUrl(src: string): string {
  return `/api/img?u=${encodeURIComponent(src)}&w=180&q=75`;
}
// Примерный цвет каждого террайна — заглушка-фон, пока картинка вне экрана
// не подгружена (см. viewport-culling в HexMapCanvas).
const TERRAIN_COLOR: Record<string, string> = {
  "01_water.webp": "#2a5a7a",
  "02_snow.webp": "#c8d6e0",
  "03_grass.webp": "#3a5f3a",
  "04_rough.webp": "#6b6558",
  "05_sand.webp": "#c2a878",
  "06_dirt.webp": "#7a5c42",
  "07_swamp.webp": "#4a5a3a",
  "08_wasteland.webp": "#8a7a5a",
  "09_lava.webp": "#7a2a1a",
  "10_subterranean.webp": "#8a8570",
  "11_highland.webp": "#6a7a5a",
};

// ──────────────────────────── Данные ────────────────────────────

type AdminLocations = Awaited<ReturnType<typeof adminListRaidLocations>>;
type AdminLocation = AdminLocations["locations"][number];
type AdminNode = AdminLocation["nodes"][number];

type Cell = {
  q: number;
  r: number;
  kind: "castle" | "boss" | "fork" | "final" | "filler";
  terrain: string;
  locationName: string | null;
  node: AdminNode | null;
};
type PortalEdge = { fromQ: number; fromR: number; toQ: number; toR: number; label: string };
type PathEdge = { fromQ: number; fromR: number; toQ: number; toR: number };

type Layout = { cells: Cell[]; portals: PortalEdge[]; paths: PathEdge[] };

const CASTLE_OWNER = "\0castle"; // служебное имя-владелец для клетки замка

/** Раскладка гекс-карты из полного списка локаций (adminListRaidLocations).
 *  Только active=true. Порядок обхода — от локаций, которые НЕ являются
 *  чьей-то дочерней (root), дальше рекурсивно по forkLinks.
 *  Детерминирована: одни и те же данные → всегда одна и та же раскладка
 *  (никакого Math.random — только хэш от id/ordinal). */
function buildLayout(locations: AdminLocation[]): Layout {
  const active = locations.filter((l) => l.active);
  const byId = new Map(active.map((l) => [l.id, l]));

  // root = не встречается ни в одном forkLinks[].targetLocationId
  const childIds = new Set<string>();
  for (const l of active)
    for (const n of l.nodes)
      for (const link of n.forkLinks) childIds.add(link.targetLocationId);
  const roots = active.filter((l) => !childIds.has(l.id));

  const occupied = new Map<string, Cell>();
  const placedStart = new Map<string, Axial>(); // locationId → его первый гекс
  const portals: PortalEdge[] = [];
  const paths: PathEdge[] = [];

  // «Своя» клетка для проверки соседства: гекс НЕ должен вставать вплотную
  // к чужой, не связанной локации (болото не должно «гулять» рядом с чем-то
  // посторонним) — разрешено касаться только своей же локации и точки,
  // от которой сюда пришли (owner локации-родителя/замка).
  const isFree = (a: Axial, owner: string, allowTouch: ReadonlySet<string>): boolean => {
    if (occupied.has(axialKey(a))) return false;
    for (let d = 0; d < 6; d++) {
      const nb = occupied.get(axialKey(neighborOf(a, d)));
      if (!nb) continue;
      const nbOwner = nb.kind === "castle" ? CASTLE_OWNER : nb.locationName;
      if (nbOwner !== owner && !(nbOwner && allowTouch.has(nbOwner))) return false;
    }
    return true;
  };

  const place = (
    candidate: Axial,
    preferDirIdx: number,
    owner: string,
    allowTouch: ReadonlySet<string>
  ): Axial => {
    if (isFree(candidate, owner, allowTouch)) return candidate;
    for (let ring = 1; ring <= 8; ring++) {
      for (let off = 0; off < 6; off++) {
        const dirIdx = preferDirIdx + (off % 2 === 0 ? off / 2 : -(off + 1) / 2);
        let a = candidate;
        for (let s = 0; s < ring; s++) a = neighborOf(a, dirIdx);
        if (isFree(a, owner, allowTouch)) return a;
      }
    }
    // край случай (почти невозможен) — первая физически свободная клетка,
    // без учёта правила соседства, лишь бы не наложиться друг на друга.
    let a = candidate;
    while (occupied.has(axialKey(a))) a = { q: a.q + 1, r: a.r };
    return a;
  };

  const setCell = (a: Axial, cell: Cell) => {
    occupied.set(axialKey(a), cell);
  };

  // Замок — центр.
  setCell(
    { q: 0, r: 0 },
    { q: 0, r: 0, kind: "castle", terrain: "", locationName: null, node: null }
  );

  function layoutLocation(
    loc: AdminLocation,
    start: Axial,
    dirIdx: number,
    parentOwner: string
  ) {
    if (placedStart.has(loc.id)) return; // уже физически размещена — сюда не попадаем
    placedStart.set(loc.id, start);
    const terrain = pickTerrain(loc.name);
    const allowTouch = new Set([parentOwner]);
    let cursor = start;
    let curDir = dirIdx;
    const nodes = [...loc.nodes].sort((a, b) => a.ordinal - b.ordinal);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const placedAt = place(cursor, curDir, loc.name, allowTouch);
      const kind: Cell["kind"] =
        n.type === "fork" ? "fork" : n.isFinal ? "final" : "boss";
      setCell(placedAt, {
        q: placedAt.q,
        r: placedAt.r,
        kind,
        terrain,
        locationName: loc.name,
        node: n,
      });
      if (i > 0) paths.push({ fromQ: cursor.q, fromR: cursor.r, toQ: placedAt.q, toR: placedAt.r });
      cursor = placedAt;
      // Лёгкий «изгиб» дороги — не идеально прямая линия. Детерминирован
      // (хэш от id локации + номер шага), не Math.random — иначе карта
      // была бы каждый раз новая.
      if (i > 0 && i % 6 === 0)
        curDir += hashStr(`${loc.id}:${i}`) % 2 === 0 ? 1 : -1;

      if (n.type === "fork" && n.forkLinks.length > 0) {
        const branches = [...n.forkLinks].sort((a, b) => a.ordinal - b.ordinal);
        // Веер направлений вокруг текущего (ЦЕЛЫЕ индексы — DIRS не терпит
        // дробных). Слот 0 — продолжение ЭТОЙ же локации (прямо вперёд),
        // остальные — дочерние локации, поочерёдно вправо/влево от него.
        const offsetForSlot = (slot: number): number => {
          if (slot === 0) return 0;
          const n2 = Math.ceil(slot / 2);
          return slot % 2 === 1 ? n2 : -n2;
        };
        branches.forEach((link, bi) => {
          const branchDir = curDir + offsetForSlot(bi + 1);
          const childLoc = byId.get(link.targetLocationId);
          if (!childLoc) return;
          if (placedStart.has(childLoc.id)) {
            // Портал: цель уже размещена где-то ещё на карте.
            const target = placedStart.get(childLoc.id)!;
            portals.push({
              fromQ: placedAt.q,
              fromR: placedAt.r,
              toQ: target.q,
              toR: target.r,
              label: childLoc.name,
            });
            return;
          }
          const childStart = place(
            neighborOf(placedAt, branchDir),
            branchDir,
            childLoc.name,
            new Set([loc.name])
          );
          paths.push({ fromQ: placedAt.q, fromR: placedAt.r, toQ: childStart.q, toR: childStart.r });
          layoutLocation(childLoc, childStart, branchDir, loc.name);
        });
        // Продолжение ЭТОЙ локации после развилки — слот 0 (offset 0).
        curDir = curDir + offsetForSlot(0);
      }
    }
  }

  roots.forEach((loc, i) => {
    const dirIdx = i % 6;
    const start = place(neighborOf({ q: 0, r: 0 }, dirIdx), dirIdx, loc.name, new Set([CASTLE_OWNER]));
    paths.push({ fromQ: 0, fromR: 0, toQ: start.q, toR: start.r });
    layoutLocation(loc, start, dirIdx, CASTLE_OWNER);
  });

  // Кольцо тумана: максимум ОДНА процедурная клетка на каждый реальный гекс,
  // похожая по террайну на соседа. Не расползается дальше одного кольца.
  const before = new Map(occupied);
  for (const [, cell] of before) {
    if (cell.kind === "castle" && before.size === 1) continue;
    for (let d = 0; d < 6; d++) {
      const n = neighborOf(cell, d);
      if (!occupied.has(axialKey(n))) {
        setCell(n, {
          q: n.q,
          r: n.r,
          kind: "filler",
          terrain: cell.terrain || TERRAIN_FILES[hashStr(axialKey(n)) % TERRAIN_FILES.length],
          locationName: null,
          node: null,
        });
        break; // одна клетка — и хватит
      }
    }
  }

  return { cells: Array.from(occupied.values()), portals, paths };
}

// ──────────────────────────── Компонент ────────────────────────────

function RaidHexMapPage() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const data = useQuery({
    queryKey: ["admin-raid-locations-hexmap"],
    queryFn: () => adminListRaidLocations(),
    enabled: !!session.data?.isAdmin,
  });

  const layout = useMemo(
    () => (data.data ? buildLayout(data.data.locations) : null),
    [data.data]
  );

  // Прогрев кэша: те же 11 тайлов используются на КАЖДОЙ клетке — грузим
  // их сразу, не дожидаясь пока конкретная клетка попадёт в кадр. К моменту,
  // когда они реально понадобятся, они уже в браузерном кэше (мгновенно).
  useEffect(() => {
    for (const file of TERRAIN_FILES) {
      const img = new Image();
      img.src = terrainUrl(file);
    }
  }, []);

  // Прогрев кэша боссов: то же самое, но через ресайз-прокси (сырой
  // imageUrl может весить до 250KB, прокси отдаёт ~5-15KB webp). Без этого
  // портрет качался бы только когда клетка попадала в зону видимости —
  // теперь все уникальные портреты стартуют сразу, параллельно с террайнами.
  useEffect(() => {
    if (!layout) return;
    const seen = new Set<string>();
    for (const c of layout.cells) {
      const url = c.node?.boss?.imageUrl;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const img = new Image();
      img.src = bossImgUrl(url);
    }
  }, [layout]);

  if (session.isLoading) return null;
  if (!session.data?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Только для админов
      </div>
    );
  }
  if (data.isLoading || !layout) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Строю карту…
      </div>
    );
  }
  return <HexMapCanvas layout={layout} />;
}

// ──────────────────────────── Пан/зум (перф) ────────────────────────────
// ViewBox у <svg> ФИКСИРОВАН навсегда — его смена на каждый пиксель
// движения (как было) заставляет браузер каждый раз переверстывать весь
// SVG. Вместо этого двигаем/масштабируем один <g> через transform
// (композитится на GPU, дёшево). Плюс: сам transform обновляется мимо
// React (напрямую в DOM через ref) на каждое событие пальца/колеса — стейт
// (нужен только чтобы решить, каким клеткам грузить картинку) обновляется
// с задержкой в 120мс ПОСЛЕ того как палец остановился, а не на каждый кадр.
const FIXED_VB = { x: -960, y: -600, w: 1920, h: 1200 };
const MIN_SCALE = 0.12;
const MAX_SCALE = 6;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
type View = { tx: number; ty: number; scale: number };

function HexMapCanvas({ layout }: { layout: Layout }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const viewRef = useRef<View>({ tx: 0, ty: 0, scale: 1 });
  const [committedView, setCommittedView] = useState<View>({ tx: 0, ty: 0, scale: 1 });
  const commitTimer = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragLast = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; startScale: number } | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);

  const applyTransform = () => {
    const g = groupRef.current;
    if (g) {
      const { tx, ty, scale } = viewRef.current;
      g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    }
  };
  const scheduleCommit = () => {
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      setCommittedView({ ...viewRef.current });
    }, 120);
  };
  const commitNow = () => {
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    setCommittedView({ ...viewRef.current });
  };

  // clientX/clientY → точка в координатах viewBox (он фиксирован, так что
  // это просто линейный пересчёт по размеру контейнера на экране).
  const screenToViewbox = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: FIXED_VB.x + ((clientX - rect.left) / rect.width) * FIXED_VB.w,
      y: FIXED_VB.y + ((clientY - rect.top) / rect.height) * FIXED_VB.h,
    };
  };
  // Зум с фиксацией точки экрана (курсор/центр щипка остаётся на месте).
  const zoomAt = (clientX: number, clientY: number, nextScaleRaw: number) => {
    const vpt = screenToViewbox(clientX, clientY);
    const { tx, ty, scale } = viewRef.current;
    const nextScale = clampScale(nextScaleRaw);
    const worldX = (vpt.x - tx) / scale;
    const worldY = (vpt.y - ty) / scale;
    viewRef.current = {
      scale: nextScale,
      tx: vpt.x - worldX * nextScale,
      ty: vpt.y - worldY * nextScale,
    };
    applyTransform();
    scheduleCommit();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    zoomAt(e.clientX, e.clientY, viewRef.current.scale * factor);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragLast.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.current.size === 2) {
      dragLast.current = null;
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        startScale: viewRef.current.scale,
      };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      zoomAt(mid.x, mid.y, pinch.current.startScale * (dist / pinch.current.dist));
      return;
    }
    if (pointers.current.size === 1 && dragLast.current) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const kx = FIXED_VB.w / rect.width;
      const ky = FIXED_VB.h / rect.height;
      const dx = (e.clientX - dragLast.current.x) * kx;
      const dy = (e.clientY - dragLast.current.y) * ky;
      dragLast.current = { x: e.clientX, y: e.clientY };
      viewRef.current = {
        ...viewRef.current,
        tx: viewRef.current.tx + dx,
        ty: viewRef.current.ty + dy,
      };
      applyTransform();
      scheduleCommit();
    }
  };
  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      const [[, p]] = pointers.current;
      dragLast.current = p;
    } else if (pointers.current.size === 0) {
      dragLast.current = null;
    }
    commitNow();
  };
  const zoomButton = (factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    zoomAt(cx, cy, viewRef.current.scale * factor);
  };

  // Видимая область в МИРОВЫХ координатах (для отсева картинок вне кадра) —
  // считается только из committedView, т.е. раз в ~120мс, а не на каждый кадр.
  // Запас поменьше (было 500): портреты боссов — САМАЯ тяжёлая часть карты
  // (до ~250КБ штука, их ~90 разных, не переиспользуются как террайн) —
  // чем меньше их грузится одновременно, тем быстрее приходит каждая штука.
  const visible = useMemo(() => {
    const { tx, ty, scale } = committedView;
    const margin = 160 / Math.max(0.25, scale);
    return {
      minX: (FIXED_VB.x - tx) / scale - margin,
      maxX: (FIXED_VB.x + FIXED_VB.w - tx) / scale + margin,
      minY: (FIXED_VB.y - ty) / scale - margin,
      maxY: (FIXED_VB.y + FIXED_VB.h - ty) / scale + margin,
    };
  }, [committedView]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a0d14]">
      <svg
        ref={svgRef}
        viewBox={`${FIXED_VB.x} ${FIXED_VB.y} ${FIXED_VB.w} ${FIXED_VB.h}`}
        className="h-full w-full touch-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        <defs>
          <clipPath id="hexClip">
            <polygon points={HEX_POINTS} />
          </clipPath>
          <radialGradient id="castleGrad">
            <stop offset="0%" stopColor="#ffe27a" />
            <stop offset="100%" stopColor="#b8860b" />
          </radialGradient>
        </defs>

        <g ref={groupRef} transform="translate(0,0) scale(1)">
          {/* Портал-дуги — под клетками, чтобы не перекрывали. */}
          {layout.portals.map((p, i) => {
            const a = axialToPixel({ q: p.fromQ, r: p.fromR });
            const b = axialToPixel({ q: p.toQ, r: p.toR });
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - 120;
            return (
              <path
                key={`portal-${i}`}
                d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                fill="none"
                stroke="#c9a8ff"
                strokeWidth={3}
                strokeDasharray="4 8"
                opacity={0.65}
              />
            );
          })}

          {layout.cells.map((c) => {
            const { x, y } = axialToPixel(c);
            const isFiller = c.kind === "filler";
            const isCastle = c.kind === "castle";
            // Viewport-culling: картинки (террайн + портрет босса) — только
            // рядом с видимой областью, и только для реальных клеток
            // (у тумана картинок нет вообще, см. ниже — это дешёвая заливка).
            const onScreen =
              !isFiller &&
              x + R > visible.minX &&
              x - R < visible.maxX &&
              y + R > visible.minY &&
              y - R < visible.maxY;
            const defeated = !!c.node?.boss && c.node.boss.currentHp <= 0;
            return (
              <g
                key={axialKey(c)}
                transform={`translate(${x},${y})`}
                onClick={() => !isFiller && !isCastle && setSelected(c)}
                style={{ cursor: isFiller || isCastle ? "default" : "pointer" }}
              >
                {isCastle ? (
                  <g clipPath="url(#hexClip)">
                    <rect x={-R} y={-R} width={R * 2} height={R * 2} fill="url(#castleGrad)" />
                  </g>
                ) : isFiller ? (
                  // Туман — просто плоская тёмная заливка, без картинки,
                  // без градиента, без джиттера. Раньше тут был отдельный
                  // проход с 3 хэшами и радиальным градиентом на клетку —
                  // самая частая (~половина всех клеток) и самая дорогая
                  // часть карты. Теперь это почти бесплатно.
                  <polygon points={HEX_POINTS} fill="#12141c" opacity={0.9} />
                ) : onScreen ? (
                  <g clipPath="url(#hexClip)">
                    <image
                      href={terrainUrl(c.terrain)}
                      x={-R}
                      y={-R}
                      width={R * 2}
                      height={R * 2}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    {c.node?.boss?.imageUrl && (
                      <image
                        href={bossImgUrl(c.node.boss.imageUrl)}
                        x={-R * 0.42}
                        y={-R * 0.42}
                        width={R * 0.84}
                        height={R * 0.84}
                        preserveAspectRatio="xMidYMid slice"
                        style={defeated ? { filter: "grayscale(1) brightness(0.55)" } : undefined}
                      />
                    )}
                  </g>
                ) : (
                  <polygon points={HEX_POINTS} fill={TERRAIN_COLOR[c.terrain] ?? "#333"} />
                )}
                {!isFiller && (
                  <polygon
                    points={HEX_POINTS}
                    fill="none"
                    stroke={isCastle ? "#f2c02a" : c.kind === "fork" ? "#41d3c6" : "rgba(255,255,255,0.25)"}
                    strokeWidth={isCastle ? 3 : c.kind === "fork" ? 2.5 : 1}
                  />
                )}
                {isCastle && (
                  <text textAnchor="middle" dy="5" fontSize={13} fontWeight={700} fill="#1a1200">
                    ЗАМОК
                  </text>
                )}
                {defeated && onScreen && (
                  <>
                    <circle r={R * 0.22} cy={R * 0.05} fill="#1a1a1a" opacity={0.75} />
                    <text textAnchor="middle" y={R * 0.14} fontSize={16} fill="#7fd98a">
                      ✓
                    </text>
                  </>
                )}
                {c.kind === "fork" && (
                  <circle r={R * 0.28} fill="#0b1a18" stroke="#41d3c6" strokeWidth={2} />
                )}
              </g>
            );
          })}

          {/* Тропы — рисуются ПОВЕРХ тайлов (иначе не видны — соседние
              гексы их полностью перекрывают). Одна линия, не две — раньше
              каждая тропа была парой <line> (обочина+дорога), сейчас цвет
              подобран так, чтобы одной было достаточно. */}
          {layout.paths.map((p, i) => {
            const a = axialToPixel({ q: p.fromQ, r: p.fromR });
            const b = axialToPixel({ q: p.toQ, r: p.toR });
            return (
              <line
                key={`path-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#c9a06a"
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.75}
              />
            );
          })}
        </g>
      </svg>

      {/* Мини-легенда + зум-кнопки (важно для телефона — жест иногда не
          ловится, кнопка ловится всегда). */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
        Щипок/колесо — зум · тащить — перемещение · клик по клетке — инфо
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <button
          onClick={() => zoomButton(1.4)}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/70 text-xl font-bold text-white backdrop-blur active:scale-95"
        >
          +
        </button>
        <button
          onClick={() => zoomButton(1 / 1.4)}
          className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/70 text-xl font-bold text-white backdrop-blur active:scale-95"
        >
          −
        </button>
      </div>

      {selected && (
        <div
          className="absolute bottom-4 left-1/2 w-[92%] max-w-sm -translate-x-1/2 rounded-2xl border border-white/15 bg-black/85 p-4 text-white backdrop-blur"
          onClick={() => setSelected(null)}
        >
          <div className="mb-1 text-xs uppercase tracking-wide text-white/50">
            {selected.locationName}
          </div>
          {selected.kind === "fork" ? (
            <div className="font-bold">Развилка</div>
          ) : selected.node?.boss ? (
            <>
              <div className="font-bold">{selected.node.boss.name}</div>
              <div className="text-xs text-white/60">
                HP {selected.node.boss.currentHp} / {selected.node.boss.maxHp}
              </div>
            </>
          ) : (
            <div className="font-bold">Узел</div>
          )}
        </div>
      )}
    </div>
  );
}
