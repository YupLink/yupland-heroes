// Панель режима бога: чем действуем, сколько накопили и когда выгружать.
//
// Три явных режима — иначе непонятно, что сделает тап: «Правка» открывает
// клетку (корабли, тиры, табличка), «Кисть» ставит выбранное, «Ластик» снимает
// всё, кроме местности. Правки живут локально, пока не нажата «Выгрузить».
//
// «Забыть» и «Выгрузить» разведены по разным углам и разным рядам нарочно:
// раньше они стояли вплотную, и промах по золотой кнопке стирал час работы —
// молча и без спроса. Теперь корзина спрашивает, точно ли забыть.
import { useEffect, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { KINDS, LIMITED_KINDS, MODES } from "./adminBrushModes";
import { AdminEraseTargets } from "./AdminEraseTargets";
import type { EraseTarget } from "./eraseTarget";
import { AdminBrushActions } from "./AdminBrushActions";
import { AdminBrushSizes } from "./AdminBrushSizes";
import { AdminCellPalette, type AssetKind } from "./AdminCellPalette";
import { VOID_ON, isGenBrush, isVoidBrush } from "./brushPatch";
import { AREA_KINDS, type Brush } from "./useAdminBrush";
import type { AdminMode } from "./useAdminLive";

/** Сколько ждём второго нажатия по корзине, прежде чем передумать за админа. */
const CONFIRM_MS = 5_000;

export function AdminBrushBar({
  brush,
  onPick,
  mode,
  onMode,
  size,
  onSize,
  pending,
  sending,
  onPublish,
  onReset,
  onGiveaway,
  onCreate,
  allow = null,
  actions = true,
  create = true,
  studio = false,
  eraseTarget = "top",
  onEraseTarget,
  eraseTerrain = false,
}: {
  brush: Brush;
  onPick: (brush: Brush) => void;
  mode: AdminMode;
  onMode: (mode: AdminMode) => void;
  /** Активный размер кисти (радиус). */
  size: number;
  onSize: (size: number) => void;
  pending: number;
  /** Пакет уже уехал на сервер: кнопки выгрузки заняты до ответа. */
  sending: boolean;
  onPublish: () => void;
  onReset: () => void;
  /** Открыть окно массовой раздачи, не уходя с карты. */
  onGiveaway: () => void;
  /** Открыть окно создания объекта (шаблон заводится тут же, с карты). */
  onCreate: () => void;
  /** Дизайнер на своём острове — только эти постройки, без раздачи, создания и объектов. */
  allow?: ReadonlySet<string> | null;
  /** Раздача (деньги) — только админу. */
  actions?: boolean;
  /** Создание объекта и «+ новый» (общий справочник) — админ или право catalogs. */
  create?: boolean;
  /** Мир креатора: сохраняет «Сохранить» студии — без «Выгрузить», корзины и раздачи. */
  studio?: boolean;
  /** Режим ластика и выбор его (AdminEraseTargets); местность — только мир креатора. */
  eraseTarget?: EraseTarget;
  onEraseTarget?: (target: EraseTarget) => void;
  eraseTerrain?: boolean;
}) {
  const t = godText(useLang());
  const limited = allow !== null;
  const [kind, setKind] = useState<AssetKind>("terrain");
  /** Корзина спросила «точно?» и ждёт второго нажатия. */
  const [confirm, setConfirm] = useState(false);

  // Вопрос сам себя снимает: забытая на экране красная кнопка опаснее, чем её
  // отсутствие — второй тап по ней через полчаса будет уже случайным.
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirm]);
  // Очередь опустела (выгрузили или забыли) — терять больше нечего.
  useEffect(() => {
    if (pending === 0) setConfirm(false);
  }, [pending]);

  /** Первый тап спрашивает, второй — забывает. */
  const tapReset = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    onReset();
  };

  // Купол не «ставится» на клетку, как трава или сундук, — он накрывает её
  // или уходит. Общая подсказка «Тап ставит: …» про него врала бы.
  const paintHint = !brush
    ? t.hintPickAsset
    : isGenBrush(brush)
      ? t.hintGen
      : isVoidBrush(brush)
        ? brush.id === VOID_ON
          ? t.hintVoidOn
          : t.hintVoidOff
        : t.hintPaint(brush.name);
  const hints = {
    erase:
      eraseTarget === "top"
        ? t.hintErase
        : eraseTarget === "terrain"
          ? t.hintEraseTerrain
          : t.hintEraseOnly(t.eraseTargets[eraseTarget]),
    paint: paintHint,
    merge: t.hintMerge,
    inspect: t.hintInspect,
  };
  const hint = mode === "spawn" ? t.hintSpawn : hints[mode];

  // Размер имеет смысл у ластика и area-кистей (местность/декор/постройка);
  // у дороги и объектов клетка одна — там строку прячем.
  const sizeable =
    mode === "erase" || (mode === "paint" && !!brush && AREA_KINDS.includes(brush.kind));

  return (
    <div className="mx-2 rounded-2xl border border-gold/30 bg-card p-2">
      {/* Четыре режима + «Выгрузить»: на телефоне режимы переносятся, кнопка
          выгрузки остаётся в строке, а не уезжает за край. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onMode(id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold",
                mode === id ? "bg-gold/15 text-gold" : "bg-secondary/40 text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label(t)}
            </button>
          ))}
        </div>
        {!studio && <button
          type="button"
          onClick={onPublish}
          disabled={pending === 0 || sending}
          className="inline-flex items-center gap-1 rounded-lg gradient-gold px-2.5 py-1 text-[11px] font-bold text-gold-foreground disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {t.publish}
          {pending > 0 ? ` · ${pending}` : ""}
        </button>}
      </div>

      {/* Корзина — в другом ряду и у другого края, чем «Выгрузить». Размер кисти
          стоит В ОДНОМ РЯДУ с урной (как в редакторе карт), не отдельной строкой. */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {!studio && <button
          type="button"
          onClick={tapReset}
          disabled={pending === 0 || sending}
          title={t.forgetTitle}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40",
            confirm
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirm ? t.forgetAsk(pending) : ""}
        </button>}
        {/* Массовая раздача и создание объекта — отсюда же. Раньше за ними
            шли в общий редактор карт: выход из рейда, меню, подгрузки — и так
            по десять раз за день. Ряд переносится (flex-wrap): на 360 px они
            не выдавливают размеры кисти за край, а уходят строкой ниже. */}
        {!limited && (actions || create) && (
          <AdminBrushActions
            t={t}
            blocked={sending || pending > 0}
            onGiveaway={actions && !studio ? onGiveaway : undefined}
            onCreate={create ? onCreate : undefined}
          />
        )}
        {sizeable && !confirm ? (
          <AdminBrushSizes
            brush={brush}
            mode={mode}
            size={size}
            onSize={onSize}
            label={t.brushSize}
          />
        ) : (
          // Своей строкой (basis-full), а не остатком ряда: после кнопки
          // «Раздать» на 360 px от предупреждения оставалась половина.
          <p className="min-w-0 basis-full truncate text-[11px] text-muted-foreground">
            {confirm ? t.forgetWarn : hint}
          </p>
        )}
      </div>

      {mode === "erase" && onEraseTarget && (
        <AdminEraseTargets t={t} value={eraseTarget} onPick={onEraseTarget} terrain={eraseTerrain} />
      )}
      {mode === "paint" && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {(limited ? LIMITED_KINDS : KINDS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] font-semibold",
                  kind === k ? "bg-gold/15 text-gold" : "bg-secondary/40 text-muted-foreground",
                )}
              >
                {t.kinds[k]}
              </button>
            ))}
          </div>
          <AdminCellPalette
            allow={allow}
            create={create}
            kind={kind}
            selected={brush?.id ?? null}
            onPick={(id, name) => onPick({ kind, id, name })}
          />
        </div>
      )}
    </div>
  );
}
