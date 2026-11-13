import { useRef, useState } from "react";
import { Backpack, BookOpen } from "lucide-react";
import { HudAsyncDialog } from "./HudAsyncDialog";

const loadHeroQuickModal = () => import("./HeroQuickModal").then(m => ({ default: m.HeroQuickModal }));

/** Direct entries reuse the active hero's existing backpack and spellbook screens. */
export function RaidQuickAccess({ ru, entry }: { ru: boolean; entry: "backpack" | "spells" }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = entry === "backpack" ? (ru ? "Рюкзак" : "Backpack") : (ru ? "Книга заклинаний" : "Spellbook");
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <button ref={trigger} type="button" className={`raid-quick-access raid-quick-access--${entry}`} aria-label={label} title={label} onClick={() => setOpen(true)}>
      {entry === "backpack" ? <Backpack aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
    </button>
    {open && <HudAsyncDialog load={loadHeroQuickModal} props={{ initialTab: entry, onClose: close }} onClose={close} ru={ru} />}
  </>;
}

