// Окно «Срубить (−1 Топор)» (владелец, 27.09): декор с инструментом не
// собирается молча — игрок видит, что отдаст (инструмент, энергию) и что
// получит, и решает сам. Нет инструмента — кнопка неактивна: «Требуется Топор».
// Имя и картинка — от товара-инструмента, не жёстко «топор».
//
// Инструмент с износом (28.09): вместо «−1 Топор» — «−25% прочности», а рядом
// с инструментом его текущая прочность.
//
// Надпись действия шаблона (29.09): «Срубить» в кнопке и заголовке — своя у
// декора («Добыть (−1 Кирка)»); нет её — прежнее «Срубить», заголовок — имя.
//
// Основной инструмент (§8.24): рубит только инструмент в руках. Он в рюкзаке,
// но в руках другое — кнопка «Взять <Топор>» (берёт в руки, окно остаётся, и та
// же кнопка уже рубит); нет вовсе — «Требуется <Топор>», неактивна.
//
// Несколько инструментов (05.10): имя, картинка и износ — того, которым рубят
// (used); нет ни одного — «Требуется Топор или Кирка» со всеми допустимыми.
//
// Руками (17.10, §8.56): нет ни одного, а декор берёт деревянный или каменный
// топор — под неактивной «Требуется …» вторая кнопка «Срубить руками»
// (DecorHandChop, её отдаёт useDecorInteract готовым элементом).
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Axe, Hand, Loader2, X, Zap } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { labelFor } from "@/lib/raid/decorInteract";
import { decorToolsOf, orList, type DecorToolView } from "@/lib/raid/decorTools";
import { shownDurability } from "@/lib/raid/mainTool";
import type { DecorInteractView } from "@/server/api/beta-raid/decor-interact";

export type DecorChopProps = {
  conf: DecorInteractView;
  /** ok — в руках (или один такой, основного нет); idle — есть, взять; none — нет. */
  tool: "ok" | "idle" | "none";
  /** Инструмент, которым рубят (или который взять); нет — первый из списка декора. */
  used?: DecorToolView | null;
  /** Прочность текущей штуки инструмента, %; нет — не показываем. */
  toolDurability?: number | null;
  busy: boolean;
  onChop: () => void;
  /** «Взять <Топор>»: сделать инструмент основным. */
  onTake: () => void;
  onClose: () => void;
  /** «Срубить руками» (§8.56) — под основной кнопкой; нет — не предлагается. */
  hand?: ReactNode;
};

function Pic({ src }: { src: string | null | undefined }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40">
      {src ? (
        <img src={thumb(src, 96, "black")} alt="" className="h-full w-full object-cover" />
      ) : (
        <Axe className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

export function DecorChopDialog({
  conf,
  tool: state,
  used,
  toolDurability,
  busy,
  onChop,
  onTake,
  onClose,
  hand,
}: DecorChopProps) {
  const t = useT();
  const lang = useLang();
  const label = labelFor(conf.label, lang);
  const tools = decorToolsOf(conf);
  const hasTool = state !== "none";
  const pick = used ?? tools[0] ?? null;
  // Нечем рубить, а годится несколько — все допустимые через «или», без цены;
  // иначе — имя того, которым рубят.
  const anyOf = !hasTool && tools.length > 1;
  const or = t("braid.decor_tool_or");
  const tool = anyOf
    ? orList(
        tools.map((x) => x.name),
        or,
      )
    : (pick?.name ?? "");
  const wear = anyOf ? null : (pick?.wear ?? null);
  // Что отдаёт рубка: штуку инструмента или проценты его прочности.
  const cost = wear
    ? t("braid.decor_chop_wear", { n: wear })
    : t("braid.decor_chop_cost", { tool });
  const worn = wear !== null && hasTool && toolDurability != null;
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="mb-[calc(env(safe-area-inset-bottom)+76px)] w-full max-w-sm rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-display text-base font-bold">
            {label ? `${label} · ${conf.name}` : conf.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            {/* Годится любой из нескольких — картинка ничья, а не первого. */}
            <Pic src={anyOf ? null : pick?.image} />
            <span className={hasTool ? "font-semibold" : "font-semibold text-destructive"}>
              {wear || anyOf ? tool : cost}
              {worn && (
                <span
                  aria-label={t("braid.tool_durability", { n: shownDurability(toolDurability) })}
                  className="ml-1.5 tabular-nums text-muted-foreground"
                >
                  {shownDurability(toolDurability)}%
                </span>
              )}
            </span>
            {wear !== null && <span className="font-semibold tabular-nums">{cost}</span>}
          </div>
          {conf.cost > 0 && (
            <span className="flex items-center gap-1 font-semibold tabular-nums">
              <Zap className="h-4 w-4 text-gold" />−{conf.cost}
            </span>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <Pic src={conf.itemImage} />
            <span className="font-semibold text-gold">
              +{conf.amount} {conf.itemName}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={state === "idle" ? onTake : onChop}
          disabled={busy || !hasTool}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === "idle" ? (
            <Hand className="h-4 w-4" />
          ) : (
            <Axe className="h-4 w-4" />
          )}
          {state === "ok"
            ? `${label ?? t("braid.decor_chop")} (${cost})`
            : state === "idle"
              ? t("tool.take", { tool })
              : t("braid.decor_need_tool", { tool })}
        </button>
        {!hasTool && hand}
      </div>
    </div>,
    document.body,
  );
}
