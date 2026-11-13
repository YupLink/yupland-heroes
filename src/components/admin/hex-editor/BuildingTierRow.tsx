// Один тир постройки: картинка, название и условия перехода на следующий.
import { Trash2, Upload } from "lucide-react";
import { thumb } from "@/lib/image";
import { RACES, SPECIALIZATIONS } from "@/components/heroMeta";
import { PortalPricesEditor } from "./PortalPricesEditor";
import type { PortalPrice } from "@/lib/portal";

export type TierPrice = {
  kind: "tickets" | "likes" | "token";
  token?: string | null;
  amount: number;
};
export type TierRequire = { race?: string | null; spec?: string | null };
export type TierDraft = {
  name: string;
  imageUrl: string | null;
  /** Прежняя одиночная цена — читается как список из одной строки. */
  price?: TierPrice | null;
  /** Полная цена: несколько ресурсов разом, как алхимия в маркете. */
  costs?: PortalPrice[] | null;
  requires?: TierRequire | null;
};

const PRICE_KINDS: Array<{ value: TierPrice["kind"]; label: string }> = [
  // Билетов нет (§8.61): цена «в билетах» платится золотом ×500.
  { value: "tickets", label: "Золото ×500 (цена в билетах)" },
  { value: "likes", label: "Лайки" },
  { value: "token", label: "Токен" },
];

export function BuildingTierRow({
  index,
  tier,
  isLast,
  tokens,
  uploading,
  onChange,
  onUpload,
  onRemove,
}: {
  index: number;
  tier: TierDraft;
  isLast: boolean;
  tokens: string[];
  uploading: boolean;
  onChange: (patch: Partial<TierDraft>) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const req = tier.requires ?? { race: null, spec: null };
  const setReq = (patch: Partial<TierRequire>) => onChange({ requires: { ...req, ...patch } });
  // Цена списком. Старую одиночную показываем первой строкой — постройки
  // заведены с ней, и терять её при первом же открытии формы нельзя.
  const costs: PortalPrice[] =
    tier.costs && tier.costs.length > 0
      ? tier.costs
      : tier.price && tier.price.amount > 0
        ? [
            {
              resource: tier.price.kind,
              token: tier.price.token ?? null,
              amount: tier.price.amount,
            },
          ]
        : [];
  // Пишем в costs, а price гасим: иначе сервер сложил бы обе цены.
  const setCosts = (next: PortalPrice[]) => onChange({ costs: next, price: null });

  return (
    <div className="space-y-2 rounded-xl border border-border p-2.5">
      <div className="flex items-center gap-2">
        <label className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-dashed border-border bg-secondary/30">
          {tier.imageUrl ? (
            <img src={thumb(tier.imageUrl, 64)} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted-foreground">
              <Upload className="h-4 w-4" />
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        <input
          value={tier.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={`Тир ${index + 1}`}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={onRemove}
          className="rounded-lg p-2 text-rose-400 transition hover:bg-rose-400/10"
          title="Убрать тир"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {uploading && <p className="text-[10px] text-muted-foreground">Загружаем картинку…</p>}

      {!isLast && (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Переход на следующий тир
          </p>
          <PortalPricesEditor prices={costs} tokens={tokens} onChange={setCosts} />

          <div className="flex flex-wrap gap-1.5">
            <select
              value={req.race ?? ""}
              onChange={(e) => setReq({ race: e.target.value || null })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="">раса: любая</option>
              {RACES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={req.spec ?? ""}
              onChange={(e) => setReq({ spec: e.target.value || null })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="">спец.: любая</option>
              {SPECIALIZATIONS.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
