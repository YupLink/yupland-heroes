import { useRef, useState, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { thumb } from "@/lib/image";
import { DifficultyBadge } from "./DifficultyBadge";
import type { getRaidFullMap } from "@/server/api/raid-map";
import type { getRaidLeaderboard } from "@/server/api/raid-leaderboard";

type FullMapT = Awaited<ReturnType<typeof getRaidFullMap>>;
type FullLocT = FullMapT["locations"][number];
type FullNodeT = FullLocT["nodes"][number];

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
              YOU
            </span>
          )}
        </div>
        <div className="pb-4">
          <BraidHChain
            nodes={chain}
            render={(n) =>
              n.type === "fork" ? (
                <span data-forkanchor={`${nid}|${n.id}`} className="inline-flex">
                  <BraidMapNode node={n} selected={n.id === selId} onClick={() => onPick(n)} />
                </span>
              ) : (
                <BraidMapNode node={n} selected={n.id === selId} onClick={() => onPick(n)} />
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

function BraidHChain({
  nodes,
  render,
}: {
  nodes: FullNodeT[];
  render: (n: FullNodeT) => React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      {nodes.map((n, i) => (
        <div key={n.id} className="flex items-center">
          {i > 0 && <span className="mx-1 h-0.5 w-4 shrink-0 rounded bg-border" />}
          <div className="relative flex flex-col items-center">
            {render(n)}
          </div>
        </div>
      ))}
    </div>
  );
}

function BraidMapNode({
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
        <span className="h-5 w-5">⑂</span>
      ) : explored && node.imageUrl ? (
        <img
          src={thumb(node.imageUrl, 96)}
          alt=""
          className={cn("h-full w-full object-cover", dead && "grayscale")}
        />
      ) : (
        <span className="h-5 w-5">?</span>
      )}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-neon">
          ✓
        </span>
      )}
    </button>
  );
}

export function BraidedMap({
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
              <path d={p.d} fill="none" stroke={p.c} strokeOpacity={0.24} strokeWidth={10} strokeLinecap="round" />
              <path d={p.d} fill="none" stroke={p.c} strokeWidth={3.5} strokeLinecap="round" />
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
