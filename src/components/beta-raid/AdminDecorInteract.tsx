// Настройка «Взаимодействия» у шаблона декора (владелец, 25.09): галочка —
// игрок может уничтожить декор; сколько это стоит энергии; какой свой товар
// (например «Дерево») и сколько он получит — числом «3» или диапазоном «2-5»;
// инструмент (27.09, необязательно) — свой товар, 1 штука за один декор; с 05.10
// инструментов список, подходит любой (AdminDecorTools);
// «Респавн, мин» (28.09, необязательно) — через сколько минут декор вернётся;
// надпись действия (29.09, необязательно) — «Срубить» / «Chop» вместо «Уничтожить».
//
// Один компонент на оба места: окно клетки в режиме бога и редактор декора.
// Сохраняется кнопкой: поля связаны (без товара галочку не включить), и
// половинчатая запись после каждого символа только путала бы игроков.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { tFor, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { costOf, LABEL_MAX, respawnOf } from "@/lib/raid/decorInteract";
import {
  adminGetDecorInteract,
  adminSetDecorInteract,
} from "@/server/api/beta-raid/decor-interact-admin";
import { MarketRefPicker } from "./market/MarketRefPicker";
import { AdminDecorTools } from "./AdminDecorTools";

const field =
  "w-20 rounded-lg border border-border bg-background px-2 py-1 text-center text-[12px] tabular-nums outline-none focus:border-gold/50";
const textField =
  "w-full min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-gold/50";

export function AdminDecorInteract({ decorId }: { decorId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["decor-interact", decorId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => adminGetDecorInteract({ data: { id: decorId } }),
    staleTime: 60_000,
  });
  const [on, setOn] = useState(false);
  const [cost, setCost] = useState("");
  const [itemId, setItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [respawn, setRespawn] = useState("");
  const [labelRu, setLabelRu] = useState("");
  const [labelEn, setLabelEn] = useState("");
  // Форма садится на сохранённое, когда оно приехало (и после сохранения).
  useEffect(() => {
    if (!q.data) return;
    setOn(q.data.on);
    setCost(q.data.cost > 0 ? String(q.data.cost) : "");
    setItemId(q.data.itemId);
    setAmount(q.data.amount);
    // Ответ старой сборки списка не знает — его единственный инструмент.
    const ids = q.data.toolItemIds ?? (q.data.toolItemId ? [q.data.toolItemId] : []);
    setToolIds(ids);
    // Ответ старой сборки поля не знает — «не возвращается».
    setRespawn(q.data.respawnMin > 0 ? String(q.data.respawnMin) : "");
    // И надписи не знает — поля пустые.
    setLabelRu(q.data.label?.ru ?? "");
    setLabelEn(q.data.label?.en ?? "");
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      adminSetDecorInteract({
        data: {
          id: decorId,
          on,
          cost: costOf(cost),
          itemId,
          amount,
          toolItemIds: toolIds,
          respawnMin: respawnOf(respawn) ?? 0,
          label: { ru: labelRu, en: labelEn },
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(key, {
        on: res.on,
        cost: res.cost,
        itemId: res.itemId,
        amount: res.amount,
        toolItemId: res.toolItemId,
        toolItemIds: res.toolItemIds,
        respawnMin: res.respawnMin,
        label: res.label,
      });
      void qc.invalidateQueries({ queryKey: ["interactive-decor"], refetchType: "all" });
      toast.success(t("decor.saved"));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const d = q.data;
  const summary = d?.on ? `⚡${d.cost} → ${d.amount}` : t("decor.off");

  return (
    <div className="w-full rounded-lg border border-border/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px]"
      >
        <Hammer className="h-3 w-3 shrink-0 text-gold" />
        <span className="font-semibold">{t("decor.interact")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && d && (
        <div className="mt-2 space-y-2 text-[11px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-gold"
              checked={on}
              onChange={(e) => setOn(e.target.checked)}
            />
            {t("decor.interact")}
          </label>
          <div>
            <div className="mb-1 text-muted-foreground">{t("decor.label")}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground">RU</span>
                <input
                  type="text"
                  value={labelRu}
                  onChange={(e) => setLabelRu(e.target.value)}
                  maxLength={LABEL_MAX}
                  placeholder={tFor("ru", "braid.act_decor")}
                  className={textField}
                />
              </label>
              <label className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground">EN</span>
                <input
                  type="text"
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  maxLength={LABEL_MAX}
                  placeholder={tFor("en", "braid.act_decor")}
                  className={textField}
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("decor.energy")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className={field}
            />
            <span className="text-muted-foreground">{t("decor.amount")}</span>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1-5"
              className={field}
            />
            <span className="text-muted-foreground">{t("decor.respawn")}</span>
            <input
              type="text"
              inputMode="numeric"
              value={respawn}
              onChange={(e) => setRespawn(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="—"
              className={field}
            />
          </div>
          <div>
            <div className="mb-1 text-muted-foreground">{t("decor.item")}</div>
            <MarketRefPicker
              kind="custom"
              value={itemId || null}
              onPick={(ref) => setItemId(ref.id)}
            />
          </div>
          <div>
            <div className="mb-1 text-muted-foreground">{t("decor.tool")}</div>
            <AdminDecorTools value={toolIds} onChange={setToolIds} />
          </div>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg gradient-gold py-1.5 text-[12px] font-bold text-gold-foreground disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("decor.save")}
          </button>
        </div>
      )}
    </div>
  );
}
