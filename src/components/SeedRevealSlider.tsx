import { useRef, useState } from "react";
import { ChevronsRight, Copy, Check, ArrowLeft, AlertTriangle } from "lucide-react";

// Безопасный доступ к сид-фразе:
//  - сид по умолчанию под рябью, открытым текстом не выводится;
//  - доступ к копированию открывается «живым» жестом — протягиванием ползунка
//    до конца (череда trusted pointer-событий, скриптом подделать сложно);
//  - копирование надёжное (async clipboard + execCommand-фолбэк);
//  - ЕСЛИ скопировать не удалось (буфер заблокирован окружением) — показываем
//    сид текстом как фолбэк, чтобы юзер мог переписать вручную и не остался без
//    доступа к своему сиду (важно для восстановления);
//  - «Назад» закрывает доступ и затирает состояние.
const HANDLE = 52;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* падаем в фолбэк */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function SeedRevealSlider({
  seed,
  onBack,
}: {
  seed: string;
  onBack?: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false); // буфер не сработал → показываем текст
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const maxRef = useRef(0);

  const start = (e: React.PointerEvent) => {
    if (unlocked || !trackRef.current) return;
    maxRef.current = trackRef.current.clientWidth - HANDLE;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* на части браузеров capture недоступен */
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    let nx = e.clientX - rect.left - HANDLE / 2;
    nx = Math.max(0, Math.min(maxRef.current, nx));
    setX(nx);
    if (nx >= maxRef.current - 3) {
      setDragging(false);
      setUnlocked(true);
      setX(maxRef.current);
    }
  };
  const end = () => {
    if (!dragging) return;
    setDragging(false);
    if (!unlocked) setX(0);
  };

  const copy = async () => {
    const ok = await copyText(seed);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      setFallback(true); // не скопировалось → показать сид, чтобы переписать
    }
  };
  const back = () => {
    setUnlocked(false);
    setFallback(false);
    setCopied(false);
    setX(0);
    onBack?.();
  };

  return (
    <div className="space-y-3">
      <div className="relative flex min-h-[78px] items-center rounded-xl border border-border/60 bg-background/50 p-4">
        {fallback ? (
          // Фолбэк: буфер заблокирован — показываем сид, чтобы переписать вручную.
          <div className="break-words font-mono text-sm leading-relaxed text-foreground">
            {seed}
          </div>
        ) : (
          <>
            <div className="select-none break-words font-mono text-sm leading-relaxed text-foreground/55 blur-[7px]">
              ворон тайна сосна берег пламя зерно ветер камень роса липа поле зов
            </div>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {unlocked ? "не показываем · только копировать" : "скрыто"}
            </span>
          </>
        )}
      </div>

      {fallback ? (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-[11px] text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Скопировать не удалось (буфер недоступен). Перепиши фразу вручную и никому не показывай.</span>
          </div>
          <button
            onClick={back}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium transition hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Готово, скрыть
          </button>
        </div>
      ) : !unlocked ? (
        <div
          ref={trackRef}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="relative h-[52px] touch-none select-none overflow-hidden rounded-full border border-gold/30 bg-secondary/40"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gold/15"
            style={{ width: x + HANDLE }}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 text-xs font-medium text-muted-foreground">
            проведи, чтобы открыть копирование →
          </span>
          <div
            onPointerDown={start}
            style={{
              transform: `translateX(${x}px)`,
              transition: dragging ? "none" : "transform .2s ease",
            }}
            className="absolute left-0 top-0 flex h-[52px] w-[52px] cursor-grab touch-none items-center justify-center rounded-full bg-gold text-gold-foreground shadow-gold active:cursor-grabbing"
          >
            <ChevronsRight className="h-5 w-5" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={back}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium transition hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>
          <button
            onClick={copy}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      )}
    </div>
  );
}
