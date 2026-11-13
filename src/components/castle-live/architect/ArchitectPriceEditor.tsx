// «Изменить цены» в окне Архитектора — только админу (ПРАВИЛА §8.59 п. 7,
// владелец 21.10.2026). Постройка, уровни 2–4 и четыре заготовки: ресурсы и
// товары из справочника. Сохранение — та же ручка, что у карточки админки
// «Шахты» (settings.architect_config; сервер проверяет админа и товары). Окно
// и карточка в Ратуше перечитывают цены сразу, без перезагрузки.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";
import type { ArchitectConfig } from "@/lib/castleArchitect";
import { architectErrorText } from "@/lib/castleArchitectText";
import {
  getArchitectAdmin,
  saveArchitectAdmin,
} from "@/server/api/castle-architect/architect-config";
import { ARCHITECT_KEY } from "@/components/castle-live/useWithArchitect";
import { ArchitectPriceBlock } from "./ArchitectPriceBlock";
import { ARCHITECT_ADMIN_KEY, PRICE_ROWS, patchPrice, toSave } from "./architectPriceDraft";

export function ArchitectPriceEditor({ ru, onClose }: { ru: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ARCHITECT_ADMIN_KEY, queryFn: () => getArchitectAdmin() });
  const [draft, setDraft] = useState<ArchitectConfig | null>(null);
  const cur = draft ?? cfg.data ?? null;
  const save = useMutation({
    mutationFn: (data: ArchitectConfig) => saveArchitectAdmin({ data: toSave(data) }),
    onSuccess: (res) => {
      qc.setQueryData(ARCHITECT_ADMIN_KEY, res);
      void qc.invalidateQueries({ queryKey: ARCHITECT_KEY });
      toast.success(ru ? "Цены Архитектора сохранены" : "Architect prices saved");
      onClose();
    },
    onError: (e: unknown) => toast.error(architectErrorText(e, ru)),
  });

  return (
    <section className="auction-ledger space-y-3" aria-labelledby="architect-prices-title">
      <h2 id="architect-prices-title" className="font-['Auction_Russo'] text-lg text-[#fff0c7]">
        {ru ? "Цены Архитектора" : "Architect prices"}
      </h2>
      {!cur ? (
        cfg.isError ? (
          <p role="alert" className="text-[#f0948a]">
            {architectErrorText(cfg.error, ru)}
          </p>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-[#edc36b]" aria-label={ru ? "Загрузка" : "Loading"} />
        )
      ) : (
        PRICE_ROWS.map((row) => (
          <ArchitectPriceBlock
            key={row.id}
            ru={ru}
            title={row.label(ru)}
            cost={row.cost(cur)}
            onChange={(next) => setDraft(patchPrice(cur, row.id, next))}
          />
        ))
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="auction-secondary" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
          {ru ? "Отмена" : "Cancel"}
        </button>
        <button
          type="button"
          className="auction-primary"
          disabled={!draft || save.isPending}
          onClick={() => draft && save.mutate(draft)}
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {ru ? "Сохранить" : "Save"}
        </button>
      </div>
    </section>
  );
}
