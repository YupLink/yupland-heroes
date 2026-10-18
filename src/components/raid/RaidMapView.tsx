import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Map as MapIcon,
  Swords,
  Gift,
  Crown,
  GitFork,
  ArrowRight,
  Zap,
  Trophy,
  Loader2,
  Check,
  ChevronDown,
  HelpCircle,
  Maximize2,
  X,
  Users,
  Heart,
  Skull,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { thumb } from "@/lib/image";
import { getRaidFullMap } from "@/server/api/raid-map";
import { raidTravel } from "@/server/api/raid-travel";
import { getRaidLeaderboard } from "@/server/api/raid-leaderboard";

// ─── Types ───────────────────────────────────────────────────────────────────

type FullMapT = Awaited<ReturnType<typeof getRaidFullMap>>;
type FullLocT = FullMapT["locations"][number];
type FullNodeT = FullLocT["nodes"][number];

type RewardCfg = {
  fillers: { kind: string; amount: number; token?: string | null }[];
  split: number[];
  packs: { packId: string; toPlace: number; name?: string; imageUrl?: string | null }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function fillerIcon(kind: string): string {
  switch (kind) {
    case "likes": return "❤️";
    case "tickets": return "🎟";
    case "energy": return "⚡";
    default: return "🪙";
  }
}

export { FullMapT, FullLocT, FullNodeT, RewardCfg };

// ─── Плашка сложности ────────────────────────────────────────────────────────

const DIFF_META: Record<string, { key: string; cls: string }> = {
  newbie: { key: "raid.diff_newbie", cls: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" },
  medium: { key: "raid.diff_medium", cls: "border-amber-400/40 bg-amber-400/15 text-amber-300" },
  hard: { key: "raid.diff_hard", cls: "border-rose-400/40 bg-rose-400/15 text-rose-300" },
};
export function DifficultyBadge({ difficulty }: { difficulty?: string | null }) {
  const t = useT();
  const d = difficulty ? DIFF_META[difficulty] : null;
  if (!d) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        d.cls
      )}
    >
      {t(d.key)}
    </span>
  );
}

// ─── Шапка + центрированный лоадер ────────────────────────────────────────────

export function Header({
  title,
  subtitle,
  badge,
  onBack,
  onClose,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const back = onBack ?? onClose;
  return (
    <div className="space-y-1">
      {back && (
        <button
          onClick={back}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("raid.back")}
        </button>
      )}
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// Re-export ArrowLeft for RaidCombatView
import { ArrowLeft } from "lucide-react";
import { humanError } from "@/lib/humanError";

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-16">{children}</div>;
}

// ─── Награды ПО МЕСТАМ ────────────────────────────────────────────────────────

export function RewardByPlace({
  places,
}: {
  places?: Array<{
    place: number;
    fillers: Array<{ kind: string; amount: number }>;
    packs: Array<{ name: string; imageUrl: string | null }>;
  }>;
}) {
  const t = useT();
  const std = new Set(["likes", "tickets", "energy"]);
  if (!places || places.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1 rounded-lg border border-border/40 bg-secondary/20 p-2">
      {places.map((p) => (
        <div key={p.place} className="flex items-start gap-2 text-[11px]">
          <span
            className={cn(
              "w-14 shrink-0 font-bold",
              p.place === 1 ? "text-gold" : p.place <= 3 ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {t("raid.place_gets", { n: p.place })}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
            {p.fillers.filter((f) => f.amount > 0).length > 0 && (
              <span>
                {p.fillers
                  .filter((f) => f.amount > 0)
                  .map(
                    (f) =>
                      `${fillerIcon(f.kind)} ${f.amount.toLocaleString()}${std.has(f.kind) ? "" : " " + f.kind}`
                  )
                  .join(" · ")}
              </span>
            )}
            {p.packs.map((pk, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-gold">
                {pk.imageUrl ? (
                  <img src={thumb(pk.imageUrl, 32)} alt="" className="h-3.5 w-3.5 rounded object-cover" />
                ) : (
                  "🎴"
                )}
                {pk.name}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Миникарта ────────────────────────────────────────────────────────────────

type NodeT = { id: string; type: string; branch: string; ordinal: number; current: boolean; boss?: { name: string; imageUrl: string | null; maxHp: number; currentHp: number } | null };

function mnRevealed(n: NodeT): boolean {
  if (n.current) return true;
  if (!n.boss) return false;
  return n.boss.currentHp <= 0 || n.boss.currentHp < n.boss.maxHp;
}

function MapNode({ node }: { node: NodeT }) {
  const t = useT();
  const dead = node.boss ? node.boss.currentHp <= 0 : false;
  const explored = mnRevealed(node);
  return (
    <div
      data-mn-current={node.current ? "1" : undefined}
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition",
        node.current
          ? "border-gold bg-gold/15 text-gold shadow-gold animate-pulse-gold"
          : dead
            ? "border-border bg-secondary/30 text-muted-foreground/40"
            : "border-dashed border-border bg-secondary/40 text-muted-foreground"
      )}
      title={explored ? node.boss?.name ?? node.type : t("raid.unexplored")}
    >
      {!explored ? (
        <HelpCircle className="h-5 w-5" />
      ) : node.boss?.imageUrl ? (
        <img
          src={thumb(node.boss.imageUrl, 96)}
          alt=""
          className={cn("h-full w-full object-cover", dead && "grayscale")}
        />
      ) : (
        <Swords className="h-5 w-5" />
      )}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-neon">
          <Check className="h-4 w-4" />
        </span>
      )}
      {node.current && (
        <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold" />
      )}
    </div>
  );
}

export function Minimap({ nodes, onExpand }: { nodes: NodeT[]; onExpand?: () => void }) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const currentId = nodes.find((n) => n.current)?.id ?? null;
  useEffect(() => {
    const cur = rootRef.current?.querySelector<HTMLElement>('[data-mn-current="1"]');
    const scroller = cur?.closest<HTMLElement>(".overflow-x-auto");
    if (!cur || !scroller) return;
    const cr = cur.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const delta = cr.left + cr.width / 2 - (sr.left + sr.width / 2);
    if (Math.abs(delta) > 4)
      scroller.scrollBy({ left: delta, behavior: "smooth" });
  }, [currentId]);
  const chain = (br: string) =>
    nodes.filter((n) => n.branch === br && n.type !== "fork").sort((a, b) => a.ordinal - b.ordinal);
  const collapse = (list: NodeT[]) => {
    const rev = list.filter(mnRevealed);
    const frontier = list.find((n) => !mnRevealed(n)) ?? null;
    return frontier ? [...rev, frontier] : rev;
  };

  const branchRow = (br: string) => {
    const list = collapse(chain(br));
    if (list.length === 0) return null;
    return (
      <div key={br} className="flex items-center gap-1 overflow-x-auto -mx-3 px-3 py-4">
        {list.map((n, i) => (
          <div key={n.id} className="flex items-center">
            {i > 0 && <span className="mx-0.5 h-0.5 w-3 shrink-0 rounded bg-border" />}
            <MapNode node={n} />
          </div>
        ))}
      </div>
    );
  };
  const rootList = chain("root");
  const rootCleared = rootList.length > 0 && rootList.every(mnRevealed);
  const showA = rootCleared && chain("A").length > 0;
  const showB = rootCleared && chain("B").length > 0;
  return (
    <div ref={rootRef} className="space-y-2 rounded-3xl border border-border bg-card/60 p-3 shadow-card">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5 text-gold" /> {t("raid.map")}
        {onExpand && (
          <button
            onClick={onExpand}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold transition active:scale-95"
          >
            <Maximize2 className="h-3 w-3" /> {t("raid.full_map")}
          </button>
        )}
      </div>
      {branchRow("root")}
      {(showA || showB) && (
        <div className="ml-2 flex items-start gap-4 border-l-2 border-dashed border-border pl-3">
          {showA && branchRow("A")}
          {showB && branchRow("B")}
        </div>
      )}
    </div>
  );
}

// ─── Вся карта (полноэкранная модалка) ────────────────────────────────────────

const BRAID_FORK_COLORS = ["#41d3c6", "#a68bff"];
type BraidFork2 = {
  forkNodeId: string;
  afterBosses: number;
  children: string[];
};

function braidCollapse(nodes: FullNodeT[]): FullNodeT[] {
  const sorted = [...nodes].sort((a, b) => a.level - b.level);
  const out: FullNodeT[] = [];
  let frontier = false;
  for (const n of sorted) {
    if (n.type === "fork" || n.explored) {
      out.push(n);
      continue;
    }
    if (!frontier) {
      out.push(n);
      frontier = true;
    }
  }
  return out;
}

function BraidedPlate({
  loc,
  nid,
  selId,
  onPick,
}: {
  loc: FullLocT;
  nid: string;
  selId: string | null;
  onPick: (n: FullNodeT) => void;
}) {
  const t = useT();
  const lang = useLang();
  const chain = braidCollapse(loc.nodes ?? []);
  return (
    <div
      className={cn(
        "relative flex-none overflow-hidden rounded-2xl border p-2.5",
        loc.isCurrent ? "border-gold/60 shadow-gold" : "border-border/70"
      )}
    >
      {loc.imageUrl && (
        <img
          src={thumb(loc.imageUrl, 360)}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.55]"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(9,12,20,.80) 0%, rgba(9,12,20,.30) 44%, rgba(9,12,20,.60) 100%)",
        }}
      />
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-1.5">
          {loc.isCurrent && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          )}
          <span
            className={cn(
              "whitespace-nowrap text-sm font-bold",
              loc.isCurrent && "text-gold"
            )}
            style={{ textShadow: "0 1px 5px rgba(0,0,0,.75)" }}
          >
            {localizeAssetName(loc.name, lang)}
          </span>
          <DifficultyBadge
            difficulty={(loc as { difficulty?: string | null }).difficulty}
          />
          {loc.isCurrent && (
            <span className="rounded-full border border-gold/40 bg-gold/15 px-1.5 text-[9px] font-bold text-gold">
              {t("raid.you_are_here")}
            </span>
          )}
        </div>
        <div className="pb-4">
          <HChain
            nodes={chain}
            render={(n) =>
              n.type === "fork" ? (
                <span data-forkanchor={`${nid}|${n.id}`} className="inline-flex">
                  <FullMapNode
                    node={n}
                    selected={n.id === selId}
                    onClick={() => onPick(n)}
                  />
                </span>
              ) : (
                <FullMapNode
                  node={n}
                  selected={n.id === selId}
                  onClick={() => onPick(n)}
                />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

type BraidTNode = {
  nid: string;
  loc: FullLocT;
  depth: number;
  forks: { forkNodeId: string; after: number; kids: BraidTNode[] }[];
};
function buildBraid(
  loc: FullLocT,
  depth: number,
  seen: Set<string>,
  path: string,
  locById: Map<string, FullLocT>
): BraidTNode {
  const forks = ((loc as { forks?: BraidFork2[] }).forks ?? [])
    .map((f, fi) => ({
      forkNodeId: f.forkNodeId,
      after: f.afterBosses,
      kids: f.children
        .filter((cid) => locById.has(cid) && !seen.has(cid))
        .map((cid, ci) =>
          buildBraid(
            locById.get(cid)!,
            depth + 1,
            new Set([...seen, cid]),
            `${path}-${fi}-${ci}`,
            locById
          )
        ),
    }))
    .filter((fk) => fk.kids.length > 0);
  return { nid: path, loc, depth, forks };
}

function BraidTreeNode({
  node,
  selId,
  onPickFor,
}: {
  node: BraidTNode;
  selId: string | null;
  onPickFor: (loc: FullLocT) => (n: FullNodeT) => void;
}) {
  return (
    <div className="inline-flex items-center">
      <div data-nid={node.nid} className="flex-none">
        <BraidedPlate
          loc={node.loc}
          nid={node.nid}
          selId={selId}
          onPick={onPickFor(node.loc)}
        />
      </div>
      {node.forks.length > 0 && (
        <div className="inline-flex flex-col gap-8 pl-28">
          {node.forks.map((f) =>
            f.kids.map((k) => (
              <BraidTreeNode
                key={k.nid}
                node={k}
                selId={selId}
                onPickFor={onPickFor}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BraidedMap({
  data,
  selId,
  onPickFor,
}: {
  data: FullMapT;
  selId: string | null;
  onPickFor: (loc: FullLocT) => (node: FullNodeT) => void;
}) {
  const locs = data.locations ?? [];
  const locById = new Map(locs.map((l) => [l.id, l]));
  const tops = locs.filter((l) => !l.parentLocationId);
  const trees = tops.map((l, i) =>
    buildBraid(l, 0, new Set([l.id]), `t${i}`, locById)
  );
  const edges: { from: string; to: string; depth: number; after: number }[] = [];
  const collect = (n: BraidTNode) => {
    n.forks.forEach((f) =>
      f.kids.forEach((k) => {
        edges.push({
          from: `${n.nid}|${f.forkNodeId}`,
          to: k.nid,
          depth: n.depth,
          after: f.after,
        });
        collect(k);
      })
    );
  };
  trees.forEach(collect);

  const ref = useRef<HTMLDivElement>(null);
  const [curves, setCurves] = useState<{ d: string; c: string }[]>([]);
  const [labels, setLabels] = useState<
    { x: number; y: number; c: string; after: number }[]
  >([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cr = el.getBoundingClientRect();
      const rel = (sel: string) => {
        const n = el.querySelector(sel);
        if (!n) return null;
        const r = (n as HTMLElement).getBoundingClientRect();
        return {
          left: r.left - cr.left,
          right: r.right - cr.left,
          cx: r.left - cr.left + r.width / 2,
          top: r.top - cr.top,
          cy: r.top - cr.top + r.height / 2,
        };
      };
      const cs: { d: string; c: string }[] = [];
      const ls: { x: number; y: number; c: string; after: number }[] = [];
      const seenLabel = new Set<string>();
      for (const e of edges) {
        const a = rel(`[data-forkanchor="${e.from}"]`);
        const b = rel(`[data-nid="${e.to}"]`);
        if (!a || !b) continue;
        const x1 = a.right;
        const y1 = a.cy;
        const x2 = b.left;
        const y2 = b.cy;
        const dx = Math.max(34, Math.abs(x2 - x1) * 0.5);
        const c = BRAID_FORK_COLORS[Math.min(e.depth, 1)];
        cs.push({
          d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
          c,
        });
        if (!seenLabel.has(e.from)) {
          seenLabel.add(e.from);
          ls.push({ x: a.cx, y: a.top - 7, c, after: e.after });
        }
      }
      setCurves(cs);
      setLabels(ls);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  return (
    <div className="overflow-x-auto pb-3">
      <div ref={ref} className="relative" style={{ minWidth: "max-content" }}>
        <svg
          width={size.w}
          height={size.h}
          className="pointer-events-none absolute left-0 top-0"
          style={{ overflow: "visible" }}
        >
          {curves.map((p, i) => (
            <g key={i}>
              <path
                d={p.d}
                fill="none"
                stroke={p.c}
                strokeOpacity={0.24}
                strokeWidth={10}
                strokeLinecap="round"
              />
              <path
                d={p.d}
                fill="none"
                stroke={p.c}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            </g>
          ))}
          {labels.map((l, i) => (
            <text
              key={`l${i}`}
              x={l.x}
              y={l.y}
              fill={l.c}
              fontSize={10}
              fontWeight={800}
              textAnchor="middle"
              stroke="#0b0f18"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ letterSpacing: ".03em" }}
            >
              ⑃ после {l.after}
            </text>
          ))}
        </svg>
        <div className="relative z-10 flex flex-col gap-10">
          {trees.map((tr) => (
            <BraidTreeNode
              key={tr.nid}
              node={tr}
              selId={selId}
              onPickFor={onPickFor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FullMapLocation({
  loc,
  isPlayerLoc,
  selId,
  onPick,
  nested,
}: {
  loc: FullLocT;
  isPlayerLoc: boolean;
  selId: string | null;
  onPick: (node: FullNodeT) => void;
  nested?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [openLeaders, setOpenLeaders] = useState(false);
  const fullLeaders = useQuery({
    queryKey: ["raid-leaderboard", loc.id],
    queryFn: () => getRaidLeaderboard({ data: { locationId: loc.id, limit: 2000 } }),
    enabled: openLeaders,
  });
  const locNodes = Array.isArray(loc.nodes) ? loc.nodes : [];
  const leaders = Array.isArray(loc.leaders) ? loc.leaders : [];
  const rewardByPlace = Array.isArray(loc.rewardByPlace) ? loc.rewardByPlace : [];
  const collapse = (chain: FullNodeT[]) => {
    const explored = chain.filter((n) => n.explored);
    const frontier = chain.find((n) => !n.explored) ?? null;
    return frontier ? [...explored, frontier] : explored;
  };
  const rawRoot = locNodes.filter((n) => n.branch === "root");
  const rawA = locNodes.filter((n) => n.branch === "A");
  const rawB = locNodes.filter((n) => n.branch === "B");
  const root = collapse(rawRoot);
  const a = collapse(rawA);
  const b = collapse(rawB);
  const rootCleared = rawRoot.length > 0 && rawRoot.every((n) => n.explored);
  const showBranches = (rawA.length > 0 || rawB.length > 0) && rootCleared;
  const pick = (n: FullNodeT) => (
    <FullMapNode node={n} selected={n.id === selId} onClick={() => onPick(n)} />
  );
  return (
    <div
      data-current={isPlayerLoc ? "1" : undefined}
      className={cn(
        "relative rounded-2xl border",
        nested ? "p-2.5" : "p-3",
        isPlayerLoc ? "border-gold/30 bg-gold/[0.05]" : "border-border/50"
      )}
    >
      {loc.imageUrl && (
        <img
          src={thumb(loc.imageUrl, 480)}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-cover opacity-[0.14]"
        />
      )}
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2">
          {isPlayerLoc && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
          <span
            className={cn(
              "font-display text-sm font-bold",
              isPlayerLoc && "text-gold"
            )}
          >
            {localizeAssetName(loc.name, lang)}
          </span>
          <DifficultyBadge difficulty={(loc as { difficulty?: string | null }).difficulty} />
          {isPlayerLoc && (
            <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-1.5 text-[9px] font-bold text-gold">
              {t("raid.you_are_here")}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" /> {loc.headcount}
          </span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-5 pt-1">
          <HChain nodes={root} render={pick} />
          {showBranches && (
            <div className="flex items-center">
              <span className="mx-1 h-0.5 w-3 shrink-0 rounded bg-border" />
              <div className="flex flex-col gap-4">
                {a.length > 0 && <HChain nodes={a} render={pick} />}
                {b.length > 0 && <HChain nodes={b} render={pick} />}
              </div>
            </div>
          )}
        </div>
        {(leaders.length > 0 || rewardByPlace.length > 0) && (
          <div className="mt-1 border-t border-border/40 pt-2">
            <button
              onClick={() => setOpenLeaders((v) => !v)}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("raid.loc_tournament")}
              </span>
              {loc.myRank != null && (
                <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-2 text-[10px] font-bold text-gold">
                  #{loc.myRank}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition",
                  loc.myRank == null && "ml-auto",
                  openLeaders && "rotate-180 text-gold"
                )}
              />
            </button>
            {openLeaders && (
              <div className="mt-1.5">
                <div className="mb-1 text-[10px] text-muted-foreground">
                  {t("raid.loc_tournament_hint")}
                </div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                  {(fullLeaders.data?.rows ?? leaders).length === 0 && !fullLeaders.isLoading && (
                    <div className="py-1 text-center text-[11px] text-muted-foreground">
                      {t("raid.no_damage_yet")}
                    </div>
                  )}
                  {fullLeaders.isLoading && (
                    <div className="py-1 text-center text-[11px] text-muted-foreground">Загрузка…</div>
                  )}
                  {(fullLeaders.data?.rows ?? leaders).map((r, i) => {
                    const place = i + 1;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded px-2 py-0.5 text-[12px]",
                          r.mine ? "bg-gold/10" : "odd:bg-secondary/30"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "w-5 shrink-0 font-bold",
                              place === 1 ? "text-gold" : place <= 3 ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            #{place}
                          </span>
                          <span className={cn("truncate", r.mine ? "font-semibold text-gold" : "text-muted-foreground")}>
                            {r.name}
                            {r.mine ? t("raid.you_suffix") : ""}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-foreground">{r.total.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
                {fullLeaders.data?.rows && (
                  <div className="mt-1 text-center text-[10px] text-muted-foreground">
                    Всего бьющих: {fullLeaders.data.rows.length}
                  </div>
                )}
                <RewardByPlace places={rewardByPlace} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HChain({
  nodes,
  render,
}: {
  nodes: FullNodeT[];
  render: (n: FullNodeT) => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center">
      {nodes.map((n, i) => (
        <div key={n.id} className="flex items-center">
          {i > 0 && <span className="mx-1 h-0.5 w-4 shrink-0 rounded bg-border" />}
          <div className="relative flex flex-col items-center">
            {render(n)}
            {n.isCurrent && (
              <span className="absolute -bottom-4 whitespace-nowrap rounded-full bg-gold/15 px-1.5 text-[9px] font-bold text-gold">
                {t("raid.you_here")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FullMapNode({
  node,
  selected,
  onClick,
}: {
  node: FullNodeT;
  selected: boolean;
  onClick: () => void;
}) {
  const { dead, isCurrent, explored, reachable } = node;
  const isFork = node.type === "fork";
  return (
    <button
      onClick={onClick}
      data-fm-current={isCurrent ? "1" : undefined}
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition active:scale-95",
        selected && "ring-2 ring-gold ring-offset-2 ring-offset-background",
        isFork
          ? isCurrent
            ? "border-gold bg-gold/20 text-gold shadow-gold animate-pulse-gold"
            : "border-gold/60 bg-gold/10 text-gold"
          : isCurrent
            ? "border-gold bg-gold/15 text-gold shadow-gold animate-pulse-gold"
            : dead
              ? "border-border bg-secondary/30 text-muted-foreground/50"
              : reachable
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-dashed border-border bg-secondary/30 text-muted-foreground/60"
      )}
    >
      {isFork ? (
        <GitFork className="h-5 w-5" />
      ) : explored && node.imageUrl ? (
        <img
          src={thumb(node.imageUrl, 96)}
          alt=""
          className={cn("h-full w-full object-cover", dead && "grayscale")}
        />
      ) : node.type === "final" && explored ? (
        <Crown className="h-5 w-5" />
      ) : node.type.startsWith("chest_") && explored ? (
        <Gift className="h-5 w-5" />
      ) : explored ? (
        <Swords className="h-5 w-5" />
      ) : (
        <HelpCircle className="h-5 w-5" />
      )}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-neon">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}

function FullMapNodeSheet({
  node,
  loc,
  energy,
  pending,
  onGo,
  onClose,
}: {
  node: FullNodeT;
  loc: FullLocT;
  energy: number;
  pending: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const hpPct =
    node.maxHp && node.maxHp > 0
      ? Math.max(0, Math.min(100, ((node.currentHp ?? 0) / node.maxHp) * 100))
      : null;
  const canGo = node.reachable && !node.isCurrent && energy >= node.steps;
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 max-h-[85%] space-y-3 overflow-y-auto rounded-t-3xl border-t border-gold/30 bg-card p-4 pb-6 shadow-boss [background-color:hsl(var(--card))]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {localizeAssetName(loc.name, lang)}
          {node.type === "fork" ? t("raid.fork_suffix") : node.type === "final" ? t("raid.final_suffix") : ""}
        </span>
        {node.dead && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neon">
            <Check className="h-3.5 w-3.5" /> {t("raid.defeated")}
          </span>
        )}
        <button onClick={onClose} className="ml-auto text-muted-foreground transition active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>

      {hpPct != null && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3 text-red-400" /> HP
            </span>
            <span className="font-mono">
              {(node.currentHp ?? 0).toLocaleString()} / {node.maxHp!.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", node.dead ? "bg-secondary" : "gradient-boss-hp")}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
      )}

      {(() => {
        const parts = Array.isArray(node.reward?.parts) ? node.reward!.parts : [];
        const packs = Array.isArray(node.reward?.packs) ? node.reward!.packs : [];
        if (parts.length === 0 && packs.length === 0) return null;
        return (
        <div className="space-y-1.5">
          {parts.filter((x) => x.amount > 0).length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4 shrink-0 text-gold" />
              <span>
                {parts
                  .filter((x) => x.amount > 0)
                  .map(
                    (x) =>
                      `${fillerIcon(x.kind)} ${x.amount.toLocaleString()}${
                        ["likes", "tickets", "energy"].includes(x.kind) ? "" : " " + x.kind
                      }`
                  )
                  .join(" · ")}
              </span>
            </div>
          )}
          {packs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {p.imageUrl ? (
                <img src={thumb(p.imageUrl, 56)} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-xs">
                  🎴
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {p.name} <span className="text-gold">{t("raid.top_n", { n: p.toPlace })}</span>
              </span>
            </div>
          ))}
        </div>
        );
      })()}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4 shrink-0 text-gold" /> {t("raid.on_location", { n: loc.headcount })}
      </div>

      {node.type === "fork" ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3.5 text-sm font-medium text-gold">
          <GitFork className="h-4 w-4" /> {t("raid.fork_branch_here")}
        </div>
      ) : (
      <button
        onClick={onGo}
        disabled={!canGo || pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3.5 font-bold text-gold-foreground shadow-gold transition enabled:active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {t("raid.traveling")}
          </>
        ) : node.isCurrent ? (
          t("raid.here_btn")
        ) : !node.reachable ? (
          <>
            <Skull className="h-4 w-4" /> {t("raid.alive_boss_ahead")}
          </>
        ) : energy < node.steps ? (
          <>
            <Zap className="h-4 w-4" /> {t("raid.low_energy", { n: node.steps })}
          </>
        ) : (
          <>
            {t("raid.go")}
            <span className="inline-flex items-center gap-0.5 text-xs opacity-80">
              <Zap className="h-3 w-3" />
              {node.steps}
              {(node as { surcharge?: boolean }).surcharge ? " (+1)" : ""}
            </span>
          </>
        )}
      </button>
      )}
      </div>
    </>
  );
}

export function FullMapModal({
  currentLocId,
  onClose,
  onTraveled,
}: {
  currentLocId: string;
  onClose: () => void;
  onTraveled: (locationId: string) => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<{ node: FullNodeT; loc: FullLocT } | null>(null);
  const map = useQuery({
    queryKey: ["raid-fullmap"],
    queryFn: () => getRaidFullMap(),
    refetchInterval: 20_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  const travel = useMutation({
    mutationFn: (targetNodeId: string) => raidTravel({ data: { targetNodeId } }),
    onSuccess: (r) => {
      toast.success(r.spent > 0 ? t("raid.travel_spent", { n: r.spent }) : t("raid.already_here"));
      onTraveled(r.locationId);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const energy = map.data?.energy ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loaded = !!map.data;
  const curNodeId = map.data?.current?.nodeId ?? null;
  useEffect(() => {
    if (!loaded || typeof document === "undefined") return;
    const t = setTimeout(() => {
      const el =
        document.querySelector('[data-fm-current="1"]') ??
        document.querySelector('[data-current="1"]');
      el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [loaded, curNodeId]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0e1420]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 560px at 12% -4%, rgba(245,196,81,.16), transparent 58%)," +
            "radial-gradient(920px 660px at 104% 106%, rgba(65,211,198,.14), transparent 55%)," +
            "radial-gradient(150% 130% at 50% 0%, transparent 52%, rgba(0,0,0,.55) 100%)," +
            "linear-gradient(180deg, #16203200, #0e1420)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(130,160,210,.7) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(130,160,210,.7) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
        }}
      />
      <div className="relative z-10 flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <MapIcon className="h-5 w-5 text-gold" />
        <span className="font-display text-lg font-bold">{t("raid.full_map")}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold">
          <Zap className="h-3.5 w-3.5" /> {energy}
        </span>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition active:scale-95"
        >
          <X className="h-4 w-4" /> {t("raid.close")}
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 pb-40">
        {map.isLoading && (
          <Center>
            <Loader2 className="h-6 w-6 animate-spin" />
          </Center>
        )}
        {!map.isLoading && (map.data?.locations ?? []).length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("raid.no_active_locations")}
          </div>
        )}
        {!map.isLoading && (map.data?.locations ?? []).length > 0 && (
          <>
            {(map.data as { isAdmin?: boolean })?.isAdmin ? (
              <BraidedMap
                data={map.data!}
                selId={sel?.node.id ?? null}
                onPickFor={(loc) => (node) =>
                  setSel((cur) =>
                    cur?.node.id === node.id ? null : { node, loc }
                  )
                }
              />
            ) : (
            <>
            {(() => {
              const all = map.data?.locations ?? [];
              const tops = all.filter((l) => !l.parentLocationId);
              const kids = (pid: string) => all.filter((l) => l.parentLocationId === pid);
              const onPick = (loc: FullLocT) => (node: FullNodeT) =>
                setSel((cur) => (cur?.node.id === node.id ? null : { node, loc }));
              return (
                <div className="space-y-3">
                  {tops.map((loc) => {
                    const children = kids(loc.id);
                    return (
                      <div key={loc.id} className="space-y-2">
                        <FullMapLocation
                          loc={loc}
                          isPlayerLoc={loc.isCurrent}
                          selId={sel?.node.id ?? null}
                          onPick={onPick(loc)}
                        />
                        {children.length > 0 && (
                          <div className="ml-3 space-y-2 border-l-2 border-gold/30 pl-3">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gold/70">
                              <GitFork className="h-3 w-3" /> {t("raid.fork_leads_to")}
                            </div>
                            {children.map((ch) => (
                              <FullMapLocation
                                key={ch.id}
                                loc={ch}
                                isPlayerLoc={ch.isCurrent}
                                selId={sel?.node.id ?? null}
                                onPick={onPick(ch)}
                                nested
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-sm font-semibold text-muted-foreground transition active:scale-[0.99]"
            >
              {t("raid.close_map")}
            </button>
          </>
        )}
      </div>

      {sel && (
        <FullMapNodeSheet
          node={sel.node}
          loc={sel.loc}
          energy={energy}
          pending={travel.isPending}
          onGo={() => travel.mutate(sel.node.id)}
          onClose={() => setSel(null)}
        />
      )}
    </div>,
    document.body
  );
}
