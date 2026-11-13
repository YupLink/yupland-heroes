// Своя постройка мира строителей в её окне (lib/buildingSale): подписать
// табличку и разобрать за половину цены. «Разобрать» — два нажатия; ключ нажатия
// живёт до успеха — повтор после обрыва не разберёт и не вернёт дважды.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hammer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import type { MarketPriceResource } from "@/lib/marketItem";
import { priceRow } from "@/components/beta-raid/portalPriceText";
import { SIGN_TEXT_MAX, type OwnOffer } from "@/lib/buildingSale";
import { dismantleBuilding } from "@/server/api/beta-raid/building-sale/bsale-dismantle";
import { setOwnSignText } from "@/server/api/beta-raid/building-sale/bsale-sign";

const newOp = () => crypto.randomUUID().replace(/-/g, "");

function OwnSign({ q, r, text }: { q: number; r: number; text: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? text;
  const save = useMutation({
    mutationFn: () => setOwnSignText({ data: { q, r, text: value } }),
    onSuccess: () => {
      toast.success(t("bsale.sign_saved"));
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        maxLength={SIGN_TEXT_MAX}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder={t("bsale.sign_placeholder")}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={draft === null || draft === text || save.isPending}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50"
      >
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("bsale.sign_save")}
      </button>
    </div>
  );
}

export function OwnBuildingActions({
  own,
  q,
  r,
  onDone,
}: {
  own: OwnOffer;
  q: number;
  r: number;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [sure, setSure] = useState(false);
  const op = useRef(newOp());
  const gone = useMutation({
    mutationFn: () => dismantleBuilding({ data: { q, r, op: op.current } }),
    onSuccess: () => {
      op.current = newOp();
      toast.success(t("bsale.dismantled"));
      invalidateRaidMap(qc);
      invalidateBackpack(qc);
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      onDone();
    },
    onError: (e: Error) => {
      setSure(false);
      toast.error(serverErrorText(e, t));
    },
  });
  const refund = own.refund.map((l) =>
    priceRow({ resource: l.resource as MarketPriceResource, token: l.token, amount: l.amount }, t),
  );
  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      {own.sign && <OwnSign q={q} r={r} text={own.text} />}
      <button
        type="button"
        onClick={() => (sure ? gone.mutate() : setSure(true))}
        disabled={gone.isPending}
        className={`flex w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${
          sure ? "border-destructive bg-destructive/10 text-destructive" : "border-border"
        }`}
      >
        {gone.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Hammer className="h-4 w-4" />
        )}
        {sure ? t("bsale.dismantle_sure") : t("bsale.dismantle")}
        {refund.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 text-gold">
            +{p.icon && <img src={p.icon} alt="" className="h-4 w-4 object-contain" />}
            {p.label}
          </span>
        ))}
      </button>
    </div>
  );
}
