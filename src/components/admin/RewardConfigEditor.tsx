// Единый редактор пула наград турнира — общий для НЕДЕЛЬНОГО БОССА и РЕЙДА.
// Раньше у босса был свой (сложный, ручной ввод split «25,18,13…» и packId
// строкой), у рейда — свой сырой велосипед. Здесь одна понятная версия:
//   • Фонд: лайки/энергия/токен/билеты/ресурс/свой товар — иконка + сумма.
//   • Паки: ДРОПДАУН реальных паков (по имени), не «cp_…» руками.
//   • Распределение: ПРЕСЕТЫ (Только 1-е / Топ-3 / Топ-10 / Топ-20) как главный
//     контрол; ручная настройка процентов по местам — под спойлером.
// Контракт данных = DraftConfig (строки числовых полей), как было у босса —
// поведение сохранения не меняется.
//
// Файл разошёлся на модули (втрое над лимитом в 250 строк): типы и конверторы
// живут в reward/rewardDraft.ts, блоки формы — в reward/*.tsx. Здесь осталась
// оболочка и РЕ-ЭКСПОРТЫ: прежние импорты «@/components/admin/RewardConfigEditor»
// продолжают работать как работали.
import { Gift } from "lucide-react";
import { type DraftConfig } from "./reward/rewardDraft";
import { RewardFundList } from "./reward/RewardFundList";
import { RewardPackList, RewardItemList } from "./reward/RewardPrizeLists";
import { RewardSplitEditor } from "./reward/RewardSplitEditor";
import { withoutUsdt } from "@/lib/usdtBanned";

export { PackPicker } from "./reward/PackPicker";
export { rewardDraftReady } from "./reward/rewardGuard";
export {
  clampNum,
  DEFAULT_SPLIT,
  DEF_CFG,
  fillerMeta,
  fromDraftCfg,
  genFlat,
  genSplit,
  toDraftCfg,
} from "./reward/rewardDraft";
export type {
  DraftConfig,
  DraftFiller,
  Filler,
  FillerKind,
  ItemReward,
  PackReward,
  RewardConfig,
} from "./reward/rewardDraft";

/**
 * Понятный редактор наград. Контролируемый: держит DraftConfig, отдаёт onChange.
 * @param allowTickets — показывать «Билеты» в типах (босс: да, рейд: нет — заморожены).
 * @param allowExtras — показывать «Ресурс» и «Свой товар».
 * @param allowUsdt — USDT в выборе токена. Только карта: там обещанный USDT
 *   сверяется со «Свободно USDT» (usdt-guard). Босс и старый рейд раздают без
 *   предела — им USDT не предлагаем, сервер его и не сохранит (ПРАВИЛА §8.49а).
 *
 * ⚠️ allowExtras по умолчанию ВЫКЛЮЧЕН, и это не осторожность ради осторожности:
 * выдавать ресурс и свой товар умеет только тракт карты (бета-рейд). Недельный
 * босс такой конфиг вообще НЕ СОХРАНИТ (схема boss.ts знает четыре старых вида),
 * а недельный турнир локации молча пропустит его на раздаче (raid-distribute).
 * Показать там кнопку значило бы пообещать награду, которой не будет.
 */
export function RewardConfigEditor({
  cfg,
  onChange,
  tokens,
  allowTickets = true,
  chipPacksOnly = false,
  allowExtras = false,
  allowUsdt = false,
}: {
  cfg: DraftConfig;
  onChange: (next: DraftConfig) => void;
  tokens: string[];
  allowTickets?: boolean;
  chipPacksOnly?: boolean;
  allowExtras?: boolean;
  allowUsdt?: boolean;
}) {
  const setCfg = (patch: Partial<DraftConfig>) => onChange({ ...cfg, ...patch });

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Gift className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold">Награды турнира</div>
          <div className="text-[11px] text-muted-foreground">
            Собери фонд — он делится между лучшими по местам.
          </div>
        </div>
      </div>

      <RewardFundList
        cfg={cfg}
        setCfg={setCfg}
        tokens={allowUsdt ? tokens : withoutUsdt(tokens)}
        allowTickets={allowTickets}
        allowExtras={allowExtras}
      />
      <RewardPackList cfg={cfg} setCfg={setCfg} chipPacksOnly={chipPacksOnly} />
      <RewardItemList cfg={cfg} setCfg={setCfg} />
      <RewardSplitEditor cfg={cfg} setCfg={setCfg} />
    </div>
  );
}
