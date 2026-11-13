// Вещь в руке — в ряду над героем, рядом с «Атаковать» и рыбалкой (владелец,
// 26.10.2026): что в руке и сколько (тап — убрать из руки), у земли и жилы — переключатель
// «тап = разместить», и когда клетки отмечены — одна кнопка сделать дело с ними
// («Разместить ×N · ⚡» / «Бросить ×N · ⚡») и ✕ снять отметки. Плашка маршрута
// остаётся маршруту: герой ходит как раньше.
import { memo, useSyncExternalStore } from "react";
import { MousePointerClick, Package, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { landOfStack } from "@/lib/landPlace";
import { useCurrentWorldArt } from "../world-art/useCurrentWorldArt";
import { WorldArtThumbnail } from "../world-art/WorldArtThumbnail";
import { formatQty } from "@/lib/formatQty";
import { useMainTool } from "@/components/beta-raid/tool/useMainTool";
import {
  clearMarks,
  dropHand,
  getHand,
  getQuick,
  handAt,
  runHand,
  setQuick,
  subscribeHand,
} from "./handStore";
import { handActLabel, handIcon } from "./handLabel";

const ROUND =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition active:scale-95";

function HandBarView() {
  const t = useT();
  const art = useCurrentWorldArt();
  const hand = useSyncExternalStore(subscribeHand, getHand, () => null);
  const quick = useSyncExternalStore(subscribeHand, getQuick, () => false);
  const tool = useMainTool(false);
  if (!hand) return null;
  const stack = tool.stacks.find((s) => s.stackKey === hand.stackKey);
  const n = hand.marks.length;
  const energy = hand.marks.reduce((sum, m) => sum + (handAt(m.q, m.r)?.cost ?? 0), 0);
  const Icon = handIcon(hand.kind);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={dropHand}
        aria-label={`${t("hand.put_away")}: ${stack?.name ?? ""}`}
        title={t("hand.put_away")}
        className={`${ROUND} border-gold/70 bg-black/85`}
      >
        {stack?.image ? (
          <WorldArtThumbnail
            art={art} kind="terrain" id={hand.kind === "land" ? landOfStack(hand.stackKey) ?? "" : ""}
            original={stack.image} width={80} cut="black"
            className="h-7 w-7 object-contain [image-rendering:pixelated]"
          />
        ) : (
          <Package className="h-5 w-5 text-gold" />
        )}
        <span className="absolute -bottom-1.5 right-[-6px] rounded-full bg-black px-1 text-[10px] font-bold tabular-nums text-gold">
          ×{formatQty(stack?.count ?? 0)}
        </span>
        <X className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full border border-border bg-black p-0.5 text-muted-foreground" />
      </button>
      {hand.kind === "land" && (
        <button
          type="button"
          onClick={() => setQuick(!quick)}
          aria-pressed={quick}
          aria-label={t("hand.quick")}
          title={t("hand.quick")}
          className={`${ROUND} ${quick ? "border-gold bg-gold text-gold-foreground" : "border-gold/40 bg-black/85 text-gold/70"}`}
        >
          <MousePointerClick className="h-5 w-5" />
        </button>
      )}
      {n > 0 && (
        <>
          <button
            type="button"
            onClick={() => runHand(hand.marks)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-gold bg-gold px-4 text-sm font-bold text-gold-foreground shadow-lg transition active:scale-95"
          >
            <Icon className="h-4 w-4" />
            {handActLabel(t, hand.kind, n, energy)}
          </button>
          <button
            type="button"
            onClick={clearMarks}
            aria-label={t("hand.clear")}
            title={t("hand.clear")}
            className={`${ROUND} h-9 w-9 border-border bg-black/85 text-muted-foreground`}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const HandBar = memo(HandBarView);
