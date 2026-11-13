// Находки лопатой у типа местности (владелец, 31.10.2026; ПРАВИЛА §8.24 п. 6б):
// окно клетки в режиме бога, под строкой «Местность». Два списка на выбор —
// свой у этой местности и общий («Все местности»). У местности без своего на
// её вкладке — общий; «Сохранить» делает его своим, «Как у всех» — снимает
// свой. Доли — как у рыбалки: сумма всегда 100 %, поднял одному — остальные
// ужались; добавил товар — потеснились все, убрал — его доля разошлась.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Shovel } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { DIG_NONE, withDigItem, withoutDigItem } from "@/lib/raid/digFinds";
import type { FishItem } from "@/lib/raid/fishChances";
import {
  getDigFindsAdmin,
  saveDigFindsAdmin,
} from "@/server/api/beta-raid/main-tool/dig-finds-config";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import { FishChances } from "@/components/admin/fishing/FishChances";
import { MarketRefPicker } from "./market/MarketRefPicker";

const tab = (on: boolean) =>
  `min-w-0 flex-1 truncate rounded-md px-2 py-1 text-[11px] ${
    on ? "bg-gold/15 text-gold" : "text-muted-foreground"
  }`;

export function AdminTerrainFinds({ terrainId, name }: { terrainId: string; name: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(true);
  const [draft, setDraft] = useState<FishItem[] | null>(null);
  const key = ["dig-finds", terrainId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getDigFindsAdmin({ data: { terrainId } }),
    enabled: open,
    staleTime: 30_000,
  });
  // Ключ кэша общий со справочником своих товаров (рыбалка, награды, маркет).
  const all = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
    enabled: open,
  });
  const d = q.data;
  const items = draft ?? (own ? (d?.own ?? d?.common) : d?.common) ?? [];
  const names = [{ id: DIG_NONE, name: t("dig.none"), image: null }, ...(all.data ?? [])];
  const scope = (v: boolean) => {
    setOwn(v);
    setDraft(null);
  };

  const save = useMutation({
    mutationFn: (list: FishItem[] | null) =>
      saveDigFindsAdmin({ data: { terrainId, forTerrain: own, items: list } }),
    onSuccess: (res) => {
      setDraft(null);
      // Общий список — у всех местностей: остальные окна перечитают его.
      void qc.invalidateQueries({ queryKey: ["dig-finds"] });
      qc.setQueryData(key, res);
      toast.success(t("dig.saved"));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="w-full rounded-lg border border-border/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        <Shovel className="h-3 w-3 shrink-0 text-gold" />
        <span className="font-semibold">{t("dig.finds")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {d ? (d.own ? name : t("dig.scope_all")) : ""}
        </span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && !d && <Loader2 className="mx-auto mt-2 h-3.5 w-3.5 animate-spin" />}
      {open && d && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            <button type="button" className={tab(own)} onClick={() => scope(true)}>
              {name}
            </button>
            <button type="button" className={tab(!own)} onClick={() => scope(false)}>
              {t("dig.scope_all")}
            </button>
          </div>
          <FishChances
            items={items}
            all={names}
            onChange={setDraft}
            onRemove={(id) => setDraft(withoutDigItem(items, id))}
            fixed={DIG_NONE}
          />
          <MarketRefPicker
            kind="custom"
            value={null}
            onPick={(ref) => setDraft(withDigItem(items, ref.id))}
          />
          <div className="flex gap-2">
            {own && d.own && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-[12px] disabled:opacity-50"
              >
                {t("dig.as_all")}
              </button>
            )}
            <button
              type="button"
              disabled={!draft || save.isPending}
              onClick={() => draft && save.mutate(draft)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg gradient-gold py-1.5 text-[12px] font-bold text-gold-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("dig.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
