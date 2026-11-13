import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  House,
  Mountain,
  MousePointer2,
  PawPrint,
  ScrollText,
  X,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { AdminCellPalette, type AssetKind } from "../AdminCellPalette";
import type { useAdminLive } from "../useAdminLive";
import { CreatorFloatingPanel } from "./CreatorFloatingPanel";
import "./creator-brush-dock.css";

type Tool =
  | Extract<AssetKind, "terrain" | "building" | "boss">
  | "quest"
  | "more";
const TOOLS = [
  { id: "terrain", ru: "Земля", en: "Terrain", Icon: Mountain },
  { id: "building", ru: "Здания", en: "Buildings", Icon: House },
  { id: "boss", ru: "Мобы", en: "Mobs", Icon: PawPrint },
  { id: "quest", ru: "Квесты", en: "Quests", Icon: ScrollText },
  { id: "more", ru: "Ещё", en: "More", Icon: Ellipsis },
] as const;

export function CreatorBrushDock({
  live,
  allow,
  advanced,
}: {
  live: ReturnType<typeof useAdminLive>;
  allow: ReadonlySet<string> | null;
  advanced: ReactNode;
}) {
  const en = useLang() === "en";
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState<Tool | null>(null);
  const [minimized, setMinimized] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const windowToggle = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const toolId = useId();
  const contentId = useId();
  const title = TOOLS.find((tool) => tool.id === open);
  const more = open === "more";
  const palette = open === "terrain" || open === "building" || open === "boss";
  useEffect(() => {
    if (open && !minimized)
      windowToggle.current?.focus({ preventScroll: true });
  }, [open, minimized]);
  const close = () => {
    setOpen(null);
    (folded ? toggle.current : opener.current)?.focus();
  };

  return (
    <>
      {live.mode === "paint" && live.brush.brush && !live.move.from && (
        <output className="creator-dock-active">
          {en ? "Brush" : "Кисть"} · {live.brush.brush.name}
        </output>
      )}
      <CreatorFloatingPanel
        className="creator-dock-tools"
        gripLabel={
          en
            ? "Move tools with arrow keys"
            : "Переместить инструменты стрелками"
        }
      >
        <button
          ref={toggle}
          type="button"
          aria-label={
            folded
              ? en
                ? "Expand tools"
                : "Развернуть инструменты"
              : en
                ? "Collapse tools"
                : "Свернуть инструменты"
          }
          aria-expanded={!folded}
          aria-controls={toolId}
          onClick={() => setFolded(!folded)}
        >
          {folded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
        <nav
          id={toolId}
          hidden={folded}
          aria-label={en ? "Creative tools" : "Инструменты креативного режима"}
        >
          <button
            type="button"
            aria-pressed={live.mode === "inspect"}
            onClick={() => {
              live.setMode("inspect");
              setOpen(null);
            }}
          >
            <MousePointer2 size={17} aria-hidden="true" />
            {en ? "Inspect" : "Осмотр"}
          </button>
          {TOOLS.filter((tool) => tool.id !== "boss" || allow === null).map(
            ({ id, ru, en: english, Icon }) => (
              <button
                key={id}
                type="button"
                disabled={id === "quest"}
                aria-expanded={
                  id === "quest" ? undefined : open === id && !minimized
                }
                title={
                  id === "quest"
                    ? en
                      ? "Quest placement is unavailable"
                      : "Размещение квестов недоступно"
                    : undefined
                }
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setOpen(id);
                  setMinimized(false);
                }}
              >
                <Icon size={17} aria-hidden="true" />
                {en ? english : ru}
              </button>
            ),
          )}
        </nav>
      </CreatorFloatingPanel>
      <CreatorFloatingPanel
        className={"creator-dock-catalog" + (minimized ? " is-minimized" : "")}
        gripLabel={
          en ? "Move window with arrow keys" : "Переместить окно стрелками"
        }
        hidden={!open}
      >
        <div
          className="creator-dock-catalog-content"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header>
            <strong>{title && (en ? title.en : title.ru)}</strong>
            <button
              ref={windowToggle}
              type="button"
              aria-label={
                minimized
                  ? en
                    ? "Expand window"
                    : "Развернуть окно"
                  : en
                    ? "Collapse window"
                    : "Свернуть окно"
              }
              aria-expanded={!minimized}
              aria-controls={contentId}
              onClick={() => setMinimized(!minimized)}
            >
              {minimized ? "+" : "−"}
            </button>
            <button
              type="button"
              aria-label={en ? "Close window" : "Закрыть окно"}
              onClick={close}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div
            id={contentId}
            className="creator-dock-catalog-body"
            hidden={minimized}
          >
            {more && advanced}
            {palette && (
              <AdminCellPalette
                kind={open}
                allow={allow}
                create={live.catalogs}
                selected={
                  live.brush.brush?.kind === open ? live.brush.brush.id : null
                }
                onPick={(id, name) => {
                  live.pickBrush({ kind: open, id, name });
                  close();
                }}
              />
            )}
          </div>
        </div>
      </CreatorFloatingPanel>
    </>
  );
}
