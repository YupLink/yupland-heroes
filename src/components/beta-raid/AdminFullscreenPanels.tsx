// Компактные входы в прежние админские инструменты поверх полноэкранной карты.
// Права и действия остаются у вызывающего экрана и вложенных панелей.
import { useEffect, useState, type ReactNode } from "react";
import { Map as MapIcon, RotateCcw, X } from "lucide-react";
import "./raid-hud-layout.css";

type PanelId = "edit" | "restore";
const TOP_ROW = "[data-hud-top], .castle-main-hud";
const GAP = 8;

// Раскрытое окно начинается под живой верхней строкой: она меняется после загрузки.
function measurePanelTop(): number {
  let top = GAP;
  for (const el of document.querySelectorAll<HTMLElement>(TOP_ROW)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.top < window.innerHeight / 3) {
      top = Math.max(top, r.bottom + GAP);
    }
  }
  // На узком экране кнопки стоят столбиком и должны остаться над окном.
  return Math.round(Math.max(top, window.innerWidth <= 360 ? 120 : 72));
}

export function AdminFullscreenPanels({
  edit,
  restore,
  editActive,
}: {
  edit: ReactNode;
  /** Нет — у дизайнера на острове: кнопки «Восстановление» нет. */
  restore?: ReactNode;
  editActive: boolean;
}) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const [panelTop, setPanelTop] = useState(120);
  const title = open === "edit" ? "Правка карты" : "Восстановление";

  useEffect(() => {
    const update = () => setPanelTop((old) => {
      const next = measurePanelTop();
      return old === next ? old : next;
    });
    update();
    const id = window.setInterval(update, 1000);
    window.addEventListener("resize", update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Широкая админская панель временно освобождает правую колонку карты.
  useEffect(() => {
    if (!open) return;
    document.body.dataset.adminPanel = "open";
    return () => { delete document.body.dataset.adminPanel; };
  }, [open]);

  return (
    <>
      <div className="raid-admin-tools pointer-events-none absolute left-2 top-2 z-[60] flex gap-2 max-[360px]:flex-col">
        <button
          type="button"
          title="Правка карты"
          aria-label="Правка карты"
          aria-expanded={open === "edit"}
          aria-controls={open ? "raid-admin-panel" : undefined}
          aria-pressed={editActive}
          onClick={() => setOpen((current) => current === "edit" ? null : "edit")}
          className={`pointer-events-auto grid h-12 w-12 place-items-center rounded-full border bg-black/90 text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${editActive ? "border-gold text-gold" : "border-white/20"}`}
        >
          <MapIcon className="h-6 w-6" aria-hidden="true" />
        </button>
        {restore !== undefined && <button
          type="button"
          title="Восстановление"
          aria-label="Восстановление"
          aria-expanded={open === "restore"}
          aria-controls={open ? "raid-admin-panel" : undefined}
          onClick={() => setOpen((current) => current === "restore" ? null : "restore")}
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/90 text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <RotateCcw className="h-6 w-6" aria-hidden="true" />
        </button>}
      </div>

      {open && (
        <section
          id="raid-admin-panel"
          aria-label={title}
          className="pointer-events-auto absolute left-2 z-[60] max-h-[60vh] w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-white/10 bg-black/90 p-2 text-white shadow-xl sm:w-[36rem]"
          style={{ top: panelTop }}
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setOpen(null)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {open === "edit" ? edit : restore}
        </section>
      )}
    </>
  );
}
