// Один мир в списке студии: тап по названию — открыть; под названием — автор
// (у чужого) и моя роль; карандаш — имя (кто может править); «люди» (автор и
// админ) — кому из креаторов мир открыт и как: нет / смотреть / править
// (владелец, 07.11.2026: «при поделиться выбираешь роль — только просмотр или
// редакция»); копия — свой новый мир из любого видного.
import { useState } from "react";
import { Copy, Pencil, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CREATOR_NAME_MAX,
  canEditWork,
  cleanWorkName,
  type CreatorWork,
} from "@/lib/raid/creator/ids";
import { useCreatorEdit, useCreatorPeers } from "./useCreator";

type Role = "view" | "edit" | null;
const ROLES: Array<{ id: Role; key: string }> = [
  { id: null, key: "creator.role_none" },
  { id: "view", key: "creator.role_view" },
  { id: "edit", key: "creator.role_edit" },
];
const ICON = "h-11 w-11 shrink-0 text-muted-foreground";

function SharePicker({ work }: { work: CreatorWork }) {
  const t = useT();
  const peers = useCreatorPeers(true);
  const edit = useCreatorEdit();
  // Автору мир открывать незачем — он и так его.
  const list = (peers.data ?? []).filter((p) => p.account !== work.ownerAccount);
  if (peers.isSuccess && list.length === 0)
    return <p className="pb-2 text-xs text-muted-foreground">{t("creator.no_peers")}</p>;
  return (
    <ul className="space-y-1 pb-2">
      {list.map((p) => {
        const now: Role = work.sharedWith.find((s) => s.account === p.account)?.role ?? null;
        return (
          <li key={p.account} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <div
              role="radiogroup"
              aria-label={p.name}
              className="flex shrink-0 rounded-lg bg-secondary/40 p-0.5"
            >
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={now === r.id}
                  disabled={edit.isPending}
                  className={cn(
                    "min-h-9 rounded-md px-2 text-[11px] font-semibold disabled:opacity-40",
                    now === r.id ? "bg-gold/15 text-gold" : "text-muted-foreground",
                  )}
                  onClick={() =>
                    now !== r.id &&
                    edit.mutate({
                      kind: "share",
                      mapId: work.mapId,
                      account: p.account,
                      role: r.id,
                    })
                  }
                >
                  {t(r.key)}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CreatorWorkItem({
  work,
  admin,
  busy,
  current = false,
  onOpen,
  onCopy,
}: {
  work: CreatorWork;
  admin: boolean;
  busy: boolean;
  /** Этот мир сейчас под героем — тап по названию никуда не ведёт. */
  current?: boolean;
  onOpen: () => void;
  onCopy?: () => void;
}) {
  const t = useT();
  const edit = useCreatorEdit();
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [name, setName] = useState(work.name);
  const clean = cleanWorkName(name);
  const canEdit = canEditWork(work, admin);
  const canShare = work.mine || admin;
  const shared = work.sharedWith.length;
  const note = [
    current && t("creator.here"),
    !work.mine && t("creator.author", { name: work.ownerName }),
    work.role === "view" && t("creator.view_only"),
    work.mine && shared > 0 && t("creator.shared_n", { n: shared }),
    work.size > 64 && t("creator.size", { n: work.size }),
  ]
    .filter(Boolean)
    .join(" · ");
  const save = () => {
    if (!clean || edit.isPending) return;
    edit.mutate(
      { kind: "rename", mapId: work.mapId, name: clean },
      { onSuccess: () => setRenaming(false) },
    );
  };
  return (
    <li>
      <div className="flex items-center gap-0.5">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input
              aria-label={t("creator.name")}
              className="h-11 min-w-0 text-base"
              value={name}
              maxLength={CREATOR_NAME_MAX}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" className="h-11" disabled={!clean || edit.isPending}>
              {t("creator.save")}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left disabled:opacity-40"
            disabled={busy}
            aria-current={current || undefined}
            aria-label={`${t("creator.open")}: ${work.name}`}
            onClick={current ? undefined : onOpen}
          >
            <span className={cn("truncate text-[15px]", current && "text-gold")}>{work.name}</span>
            {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
          </button>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ICON}
            aria-label={t("creator.rename")}
            aria-pressed={renaming}
            onClick={() => {
              setName(work.name);
              setRenaming(!renaming);
            }}
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
        {onCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ICON}
            aria-label={t("creator.copy")}
            disabled={busy}
            onClick={onCopy}
          >
            <Copy aria-hidden="true" />
          </Button>
        )}
        {canShare && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(ICON, sharing && "text-gold")}
            aria-label={t("creator.share")}
            aria-pressed={sharing}
            onClick={() => setSharing(!sharing)}
          >
            <Users aria-hidden="true" />
          </Button>
        )}
      </div>
      {sharing && canShare && <SharePicker work={work} />}
    </li>
  );
}
