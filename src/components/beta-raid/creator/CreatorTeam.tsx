// Вкладка «Креаторы» — только админам (владелец и Ярослав): «добавить креатора»
// по нику Telegram и каталог — все креаторы и их миры (портфолио; тап по
// креатору раскрывает его миры). Мир открывается тапом, как в «Мирах».
import { useState } from "react";
import { ChevronDown, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreatorWorkItem } from "./CreatorWorkItem";
import { useAddCreator, useCreatorTeam } from "./useCreator";

export function CreatorTeam({
  currentMapId,
  busy,
  onOpen,
  onCopy,
}: {
  currentMapId: string | null;
  busy: boolean;
  onOpen: (mapId: string) => void;
  onCopy: (mapId: string) => void;
}) {
  const t = useT();
  const team = useCreatorTeam(true);
  const add = useAddCreator();
  const [nick, setNick] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nick.trim() && !add.isPending) add.mutate(nick, { onSuccess: () => setNick("") });
        }}
      >
        <Input
          aria-label={t("creator.add_creator")}
          placeholder={t("creator.add_ph")}
          className="h-11 min-w-0 text-base"
          value={nick}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setNick(e.target.value)}
        />
        <Button type="submit" className="h-11" disabled={!nick.trim() || add.isPending}>
          <UserPlus aria-hidden="true" />
          {t("creator.add_btn")}
        </Button>
      </form>
      <ul className="divide-y divide-border/60">
        {(team.data ?? []).map((m) => (
          <li key={m.account}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 text-left"
              aria-expanded={open === m.account}
              onClick={() => setOpen(open === m.account ? null : m.account)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{m.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("creator.works_n", { n: m.works.length })}
                  {!m.creator && ` · ${t("creator.not_creator_mark")}`}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition",
                  open === m.account && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {open === m.account && m.works.length > 0 && (
              <ul className="mb-2 ml-3 divide-y divide-border/40 border-l border-border/60 pl-2">
                {m.works.map((w) => (
                  <CreatorWorkItem
                    key={w.mapId}
                    work={w}
                    admin
                    busy={busy}
                    current={w.mapId === currentMapId}
                    onOpen={() => onOpen(w.mapId)}
                    onCopy={() => onCopy(w.mapId)}
                  />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
