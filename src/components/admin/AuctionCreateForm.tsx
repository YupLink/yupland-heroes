// Форма создания аукциона в дизайне замка: приз из выпадашки, валюта из реестра,
// длительность/шаг/антиснайпер — пилюлями (как в Sendler). Классы — auction-screen.css.
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Gavel } from "lucide-react";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { adminListPacks } from "@/server/api/packs";
import { adminListItems } from "@/server/api/items";
import { adminCreateAuction, auctionCurrencies } from "@/server/api/game-auction";
import { PIECE_QTY_MAX, RESOURCE_QTY_MAX } from "@/lib/auctionCurrency";
import {
  Pills,
  PrizePicker,
  CountField,
  clampInt,
  countOrThrow,
  aucWord,
  KIND_LABELS,
  DURATIONS,
  DUR_LABEL,
  STEPS,
  SNIPE,
  RESOURCES,
  type PrizeKind,
  type PrizeOption,
} from "./AuctionFormBits";

export function AuctionCreateForm({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<PrizeKind>("pack");
  const [prizeRef, setPrizeRef] = useState("");
  const [prizeQty, setPrizeQty] = useState("1");
  const [copies, setCopies] = useState("1");
  const [currency, setCurrency] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>("1d");
  const [step, setStep] = useState(5);
  const [snipe, setSnipe] = useState(5);

  const currencies = useQuery({ queryKey: ["auc-currencies"], queryFn: () => auctionCurrencies() });
  const chipPacks = useQuery({
    queryKey: ["admin-chip-packs"],
    queryFn: () => adminListChipPacks(),
    enabled: kind === "pack",
  });
  const nftPacks = useQuery({
    queryKey: ["admin-nft-packs"],
    queryFn: () => adminListPacks({ data: {} }),
    enabled: kind === "pack",
  });
  const items = useQuery({
    queryKey: ["admin-items", kind],
    queryFn: () => adminListItems({ data: { kind: kind as "hero" | "artifact" } }),
    enabled: kind === "hero" || kind === "artifact",
  });

  const options = useMemo<PrizeOption[]>(() => {
    if (kind === "resource") return RESOURCES;
    if (kind === "pack") {
      const cp = (chipPacks.data ?? []).map((p) => ({
        ref: p.id,
        label: p.name,
        image: p.coverImageUrl,
      }));
      const pk = (nftPacks.data ?? []).map((p) => ({
        ref: p.id,
        label: p.name,
        image: p.imageUrl,
      }));
      return [...cp, ...pk];
    }
    return (items.data ?? []).map((i) => ({ ref: i.id, label: i.name, image: i.imageUrl }));
  }, [kind, chipPacks.data, nftPacks.data, items.data]);

  const copyCount = clampInt(copies, 1, 20);
  // Ресурс — сколько угодно (как в лоте игрока), остальное — штучный товар.
  const qtyMax = kind === "resource" ? RESOURCE_QTY_MAX : PIECE_QTY_MAX;

  const create = useMutation({
    mutationFn: async () => {
      if (!prizeRef) throw new Error("Выбери приз");
      if (!currency) throw new Error("Выбери валюту");
      const price = Number(startPrice);
      if (!(price > 0)) throw new Error("Стартовая цена больше нуля");
      return adminCreateAuction({
        data: {
          prizeKind: kind,
          prizeRef,
          prizeQty: countOrThrow(
            prizeQty,
            qtyMax,
            (m) => `Штук в лоте — не больше ${m.toLocaleString("ru-RU")}`,
          ),
          copies: copyCount,
          currency,
          startPrice: price,
          duration,
          minStepPct: step,
          antiSnipeMin: snipe,
        },
      });
    },
    onSuccess: (r) => {
      const n = r.ids.length;
      toast.success(n > 1 ? `Запущено ${n} ${aucWord(n)}` : "Аукцион запущен");
      setPrizeRef("");
      setStartPrice("");
      setPrizeQty("1");
      setCopies("1");
      onCreated();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="auction-ledger auction-form">
      <div>
        <label className="auction-label">Что разыгрываем</label>
        <select
          className="auction-field"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as PrizeKind);
            setPrizeRef("");
          }}
        >
          {KIND_LABELS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="auction-label">Приз</label>
        <PrizePicker options={options} value={prizeRef} onChange={setPrizeRef} />
      </div>

      <div className="auction-row2 auction-row2--nums">
        <CountField label="Штук в лоте" value={prizeQty} onChange={setPrizeQty} max={qtyMax} />
        <CountField label="Копий" value={copies} onChange={setCopies} max={20} />
      </div>

      <div className="auction-row2">
        <div>
          <label className="auction-label">Валюта ставки</label>
          <select
            className="auction-field"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">— выбери —</option>
            {(currencies.data?.options ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="auction-label">Стартовая цена</label>
          <input
            className="auction-field"
            type="number"
            min={0}
            value={startPrice}
            onChange={(e) => setStartPrice(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="auction-label">Длительность</label>
        <Pills
          value={duration}
          options={DURATIONS}
          onPick={setDuration}
          fmt={(d) => DUR_LABEL[d]}
        />
      </div>
      <div>
        <label className="auction-label">Минимальный шаг</label>
        <Pills value={step} options={STEPS} onPick={setStep} fmt={(s) => `${s}%`} />
      </div>
      <div>
        <label className="auction-label">Антиснайпер</label>
        <Pills
          value={snipe}
          options={SNIPE}
          onPick={setSnipe}
          fmt={(s) => (s === 0 ? "Нет" : `${s} мин`)}
        />
      </div>

      <button
        type="button"
        className="auction-primary"
        style={{ width: "100%" }}
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Gavel className="h-4 w-4" />
        )}
        {copyCount > 1 ? `Запустить ${copyCount} ${aucWord(copyCount)}` : "Запустить аукцион"}
      </button>
    </div>
  );
}
