import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, History } from "lucide-react";
import { useT } from "@/lib/i18n";
import { myChipInventory } from "@/server/api/chips-pack";
import { myTrainingChips } from "@/server/api/hallway";
import { labelForLevel } from "@/components/chips/levelLabel";
import { FlatChip, FlatChipCard } from "./FlatChipCard";
import { ChipInventoryFilters } from "./ChipInventoryFilters";
import { ChipDetailModalLoader } from "./ChipDetailModalLoader";
import { TrainingChipDetailModal } from "./TrainingChipDetailModal";
import { ChipHistoryModal } from "./ChipHistoryModal";
import { useNowTick } from "./chipBusy";

const INV_PAGE_SIZE = 10;
const TRAINING_COLLECTION_ID = "__training__";

export function MyInventoryTab() {
  const t = useT();
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory() });
  const train = useQuery({ queryKey: ["my-training-chips"], queryFn: () => myTrainingChips() });
  const [visible, setVisible] = useState(INV_PAGE_SIZE);
  // Общий тик таймеров «оглушена / отдыхает» — карточки его только читают.
  const nowTick = useNowTick();
  const [showHistory, setShowHistory] = useState(false);
  // stunUntil несём с собой: getMyChipsForTemplate (грузит модалку) про
  // оглушение не знает, а в карточке фишки оно нужно.
  const [openChip, setOpenChip] = useState<{
    chipId: string;
    templateId: string;
    stunUntil?: string | null;
  } | null>(null);
  const [openTraining, setOpenTraining] = useState<{
    chipId: string;
    star: number;
    serialNo: number;
    sellTickets: number;
    sellable: boolean;
    imageUrl: string;
  } | null>(null);
  const [fCol, setFCol] = useState<string | null>(null);
  const [fLvl, setFLvl] = useState<number | null>(null);
  const [fNum, setFNum] = useState("");
  const resetVisible = () => setVisible(INV_PAGE_SIZE);

  const groups = inv.data ?? [];
  const trainingChips = train.data ?? [];

  const flat = useMemo<FlatChip[]>(() => {
    const out: FlatChip[] = [];
    for (const g of groups) {
      for (const c of g.chips) {
        out.push({
          id: c.id,
          serialNo: c.serialNo,
          templateId: g.templateId,
          templateNo: g.templateNo,
          templateName: g.templateName,
          imageUrl: g.imageUrl,
          collectionId: g.collectionId,
          collectionName: g.collectionName,
          level: g.level,
          obtainedAt: c.obtainedAt,
          restUntil: c.restUntil,
          // Оглушение боссом висит на конкретной фишке — без него серая
          // карточка «выбита» в инвентаре не появлялась бы вовсе.
          stunUntil: c.stunUntil,
          // Учится в университете: карточка становится серой и с подписью, а
          // продажа и бой её не берут (сервер отбирает только 'owned').
          studying: c.studying,
        });
      }
    }
    for (const c of trainingChips) {
      out.push({
        id: c.id,
        serialNo: c.serialNo,
        templateId: TRAINING_COLLECTION_ID,
        templateNo: c.serialNo,
        templateName: "Тренировочная",
        imageUrl: c.imageUrl ?? "",
        collectionId: TRAINING_COLLECTION_ID,
        collectionName: "Тренировочные",
        level: c.star,
        obtainedAt: c.obtainedAt,
        isTraining: true,
        sellTickets: c.sellTickets,
        sellable: c.sellable,
      });
    }
    out.sort(
      (a, b) =>
        b.level - a.level ||
        (a.serialNo ?? Number.MAX_SAFE_INTEGER) - (b.serialNo ?? Number.MAX_SAFE_INTEGER),
    );
    return out;
  }, [groups, trainingChips]);

  const collections = useMemo(
    () =>
      Array.from(new Map(flat.map((c) => [c.collectionId, c.collectionName])).entries()).map(
        ([id, name]) => ({ id, name }),
      ),
    [flat],
  );
  const levels = useMemo(
    () => Array.from(new Set(flat.map((c) => c.level))).sort((a, b) => b - a),
    [flat],
  );

  const numQ = fNum.trim();
  const filtered = useMemo(
    () =>
      flat.filter(
        (c) =>
          (fCol === null || c.collectionId === fCol) &&
          (fLvl === null || c.level === fLvl) &&
          (numQ === "" || String(c.templateNo).includes(numQ)),
      ),
    [flat, fCol, fLvl, numQ],
  );

  if (inv.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (groups.length === 0 && trainingChips.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-border bg-secondary/20 p-8 text-center text-sm text-muted-foreground">
        {t("chips.inventory_empty")}
      </div>
    );
  }

  const anyFilter = fCol !== null || fLvl !== null || numQ !== "";
  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-end">
        <button
          onClick={() => setShowHistory(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" /> {t("chips.history_btn")}
        </button>
      </div>
      {showHistory && <ChipHistoryModal onClose={() => setShowHistory(false)} />}
      <ChipInventoryFilters
        collections={collections}
        levels={levels}
        fCol={fCol}
        fLvl={fLvl}
        fNum={fNum}
        anyFilter={anyFilter}
        setFCol={(v) => {
          setFCol(v);
          resetVisible();
        }}
        setFLvl={(v) => {
          setFLvl(v);
          resetVisible();
        }}
        setFNum={(v) => {
          setFNum(v);
          resetVisible();
        }}
        onReset={() => {
          setFCol(null);
          setFLvl(null);
          setFNum("");
          resetVisible();
        }}
      />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("chips.my_chips_count", { n: filtered.length })}
        <span className="ml-1 text-foreground/60">
          {t("chips.shown_count", { n: shown.length })}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-xs text-muted-foreground">
          {t("chips.filter_no_match")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((c) => (
            <FlatChipCard
              key={c.id}
              chip={c}
              nowTick={nowTick}
              onClick={() =>
                c.isTraining
                  ? setOpenTraining({
                      chipId: c.id,
                      star: c.level,
                      serialNo: c.serialNo ?? c.templateNo,
                      sellTickets: c.sellTickets ?? 0,
                      sellable: c.sellable !== false,
                      imageUrl: c.imageUrl,
                    })
                  : setOpenChip({
                      chipId: c.id,
                      templateId: c.templateId,
                      stunUntil: c.stunUntil,
                    })
              }
            />
          ))}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + INV_PAGE_SIZE)}
          className="mx-auto mt-2 flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-5 py-2 text-xs font-bold text-gold transition hover:bg-gold/20"
        >
          {t("chips.load_more", { n: Math.min(INV_PAGE_SIZE, filtered.length - visible) })}
        </button>
      )}
      {openChip && (
        <ChipDetailModalLoader
          chipId={openChip.chipId}
          templateId={openChip.templateId}
          stunUntil={openChip.stunUntil}
          onClose={() => setOpenChip(null)}
        />
      )}
      {openTraining && (
        <TrainingChipDetailModal
          chipId={openTraining.chipId}
          star={openTraining.star}
          serialNo={openTraining.serialNo}
          sellTickets={openTraining.sellTickets}
          sellable={openTraining.sellable}
          imageUrl={openTraining.imageUrl}
          onClose={() => setOpenTraining(null)}
          onSold={() => {
            setOpenTraining(null);
            inv.refetch();
            train.refetch();
          }}
        />
      )}
    </div>
  );
}
