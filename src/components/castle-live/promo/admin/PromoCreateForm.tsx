// Форма «Новый промокод»: код (или «Сгенерировать»), предел игроков и
// награды строками. Создать — одна кнопка внизу; ошибки — у полей и тостом.
import { useContext, useState } from "react";
import { Dices, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { generatePromoCode } from "@/lib/promo/promoCode";
import { PROMO_MAX_LINES } from "@/lib/promo/promoTypes";
import { promoShares } from "@/lib/promo/promoShares";
import { newOpId } from "../promoView";
import { PromoLineEditor } from "./PromoLineEditor";
import { PromoSoftContext } from "./PromoKindMenu";
import {
  draftError,
  draftToInput,
  editDraft,
  emptyDraft,
  lineOfKind,
  lineWeight,
  type PromoDraft,
} from "./promoDraft";
import { usePromoCreate } from "./usePromoAdmin";

const CAP = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-gold/50";

export function PromoCreateForm({
  onCreated,
  initial,
  canToken,
}: {
  onCreated: (code: string) => void;
  /** Владелец: в сетке видов есть токен. */
  canToken: boolean;
  /** Только для теста: готовый черновик. */
  initial?: PromoDraft;
}) {
  const t = useT();
  // Черновик и ключ нажатия — вместе: любая правка выдаёт новый ключ (editDraft).
  // Не админ — только энергия и лайки: первая и новые строки — энергия.
  const first = useContext(PromoSoftContext) ? "energy" : "resource";
  const [st, setSt] = useState(() => ({ draft: initial ?? emptyDraft(first), opId: newOpId() }));
  const { draft, opId } = st;
  const create = usePromoCreate((code) => {
    setSt({ draft: emptyDraft(first), opId: newOpId() });
    onCreated(code);
  });
  const error = draftError(draft);
  // Выпадает одна строка по весам: у каждой — её шанс, %.
  const shares = promoShares(draft.lines.map(lineWeight));
  const set = (p: Partial<PromoDraft>) => setSt((s) => editDraft(s, p, newOpId));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error && !create.isPending) create.mutate(draftToInput(draft, opId));
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
        <label className="min-w-0">
          <span className={CAP}>{t("promo.adm.code")}</span>
          <div className="flex gap-2">
            <input
              value={draft.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              maxLength={32}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              className={cn(FIELD, "font-display uppercase tracking-wider")}
            />
            <button
              type="button"
              onClick={() => set({ code: generatePromoCode() })}
              aria-label={t("promo.adm.generate")}
              title={t("promo.adm.generate")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-gold hover:border-gold/50"
            >
              <Dices className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </label>
        <label className="min-w-0">
          <span className={CAP}>{t("promo.adm.max_users")}</span>
          <input
            value={draft.maxUsers}
            onChange={(e) => set({ maxUsers: e.target.value })}
            inputMode="numeric"
            placeholder="∞"
            className={cn(FIELD, "tabular-nums")}
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className={CAP}>{t("promo.adm.rewards")}</span>
        {draft.lines.map((line, i) => (
          <PromoLineEditor
            key={line.key}
            line={line}
            canRemove={draft.lines.length > 1}
            canToken={canToken}
            share={draft.lines.length > 1 ? shares[i] : null}
            onChange={(next) => set({ lines: draft.lines.map((l, j) => (j === i ? next : l)) })}
            onRemove={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}
          />
        ))}
        {draft.lines.length < PROMO_MAX_LINES && (
          <button
            type="button"
            onClick={() => set({ lines: [...draft.lines, lineOfKind(first)] })}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:border-gold/50 hover:text-gold"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("promo.adm.add_line")}
          </button>
        )}
      </div>

      {error && draft.lines.some((l) => l.amount.trim() !== "") && (
        <p role="alert" className="text-xs text-destructive">
          {t(error)}
        </p>
      )}
      <button
        type="submit"
        data-game-button="primary"
        disabled={!!error || create.isPending}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 text-sm font-bold text-gold-foreground shadow-gold disabled:opacity-40"
      >
        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("promo.adm.create")}
      </button>
    </form>
  );
}
