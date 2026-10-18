import { useRef, useEffect } from "react";
import { Map as MapIcon, HelpCircle, Maximize2, Check, Swords } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import type { NodeT } from "./raid-screen-types";

function mnRevealed(n: NodeT): boolean {
  if (n.current) return true;
  if (!n.boss) return false;
  return n.boss.currentHp <= 0 || n.boss.currentHp < n.boss.maxHp;
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

export function MapNode({ node }: { node: NodeT }) {
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
