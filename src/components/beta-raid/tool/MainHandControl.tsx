import { useState } from "react";
import { Check, Hand, Loader2, X } from "lucide-react";
import { TavernDialog } from "@/components/castle-live/TavernDialog";
import { thumb } from "@/lib/image";
import "./main-hand-control.css";

export type HandTool = { stackKey: string; name: string; image?: string | null; count: number; durability?: number | null; tool?: boolean; shovel?: boolean | null; rod?: boolean | null };
type Props = {
  ru: boolean; main: HandTool | null; stacks: HandTool[];
  loading?: boolean; failed?: boolean; busy?: boolean;
  onRetry: () => void; onTake: (key: string | null) => Promise<unknown>;
};
const durability = (n: number) => Math.min(100, Math.max(1, Math.round(n || 0)));

/** The server supplies eligible tools; this view only chooses a backpack stack. */
export function MainHandControl({ ru, main, stacks, loading, failed, busy, onRetry, onTake }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const tools = stacks.filter(s => (s.tool || s.shovel || s.rod) && s.count >= 1);
  const locked = pending || busy;
  const title = ru ? "Главная рука" : "Main hand";
  const choose = async (key: string | null) => {
    if (locked) return;
    setPending(true); setError(false);
    try { await onTake(key); setOpen(false); }
    catch { setError(true); }
    finally { setPending(false); }
  };
  return <>
    <button type="button" className={`raid-main-hand${main?.rod ? " raid-main-hand--rod" : main?.image ? " raid-main-hand--equipped-image" : ""}`} aria-haspopup="dialog" aria-label={`${title}: ${main?.name ?? (ru ? "пусто" : "empty")}`} onClick={() => { setError(false); setOpen(true); }}>
      {main?.image ? <img src={thumb(main.image, 80, "black")} alt="" /> : <Hand aria-hidden="true" />}
      <span>{main && main.durability != null ? `${durability(main.durability)}%` : ru ? "Рука" : "Hand"}</span>
    </button>
    {open && <TavernDialog title={title} onClose={() => setOpen(false)} locked={!!locked} className="raid-hand-picker" overlayClassName="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-3">
      <div className="raid-hand-picker__header"><h2>{title}</h2><button type="button" disabled={!!locked} aria-label={ru ? "Закрыть" : "Close"} onClick={() => setOpen(false)}><X /></button></div>
      {loading ? <p role="status"><Loader2 className="animate-spin" />{ru ? "Загружаем инструменты…" : "Loading tools…"}</p> : failed ? <div role="alert"><p>{ru ? "Не удалось загрузить инструменты." : "Could not load tools."}</p><button className="raid-hand-picker__retry" onClick={onRetry}>{ru ? "Повторить" : "Retry"}</button></div> : <>
        {tools.length === 0 && <p>{ru ? "В рюкзаке героя пока нет инструментов." : "No tools in this hero’s backpack yet."}</p>}
        <div className="raid-hand-picker__list">
          {tools.map(s => <button type="button" key={s.stackKey} className="raid-hand-picker__item" disabled={!!locked || main?.stackKey === s.stackKey} onClick={() => void choose(s.stackKey)}>
            {s.image ? <img src={thumb(s.image, 96, "black")} alt="" /> : <Hand aria-hidden="true" />}
            <span><strong>{s.name}</strong><small>{s.durability != null ? `${durability(s.durability)}% · ` : ""}×{s.count}</small></span>
            {main?.stackKey === s.stackKey ? <Check aria-label={ru ? "В руке" : "Equipped"} /> : <span className="raid-hand-picker__take">{ru ? "Взять" : "Take"}</span>}
          </button>)}
        </div>
        {main && <button type="button" className="raid-hand-picker__put-away" disabled={!!locked} onClick={() => void choose(null)}>{ru ? "Освободить руку" : "Empty hand"}</button>}
      </>}
      {locked && <p role="status">{ru ? "Меняем инструмент…" : "Changing tool…"}</p>}
      {error && <p role="alert">{ru ? "Не удалось сменить инструмент. Попробуй ещё раз." : "Could not change the tool. Try again."}</p>}
    </TavernDialog>}
  </>;
}
