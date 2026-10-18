// Карточка заклинания в админке: имя, картинка, эффекты, цена и откат.
//
// Эффекты рисует общий редактор (BoostEffectsEditor) — тот же, что у алтаря и
// своего товара маркета: формат BoostEffect[] один на всю игру, и второго
// разбора «+1-10 к скорости» заводить незачем.
//
// Числа вводятся строками и чистятся при отправке (payloadOf): подставленный
// «0» в поле нельзя было бы переписать, не стерев его целиком.
import { Loader2, Save, X, ImagePlus } from "lucide-react";
import { thumb } from "@/lib/image";
import type { SpellKind } from "@/server/api/beta-raid/spell-tpl";
import { BoostEffectsEditor } from "@/components/beta-raid/market/BoostEffectsEditor";
import { oblivionEffectsOk } from "@/lib/hero/oblivionRule";
import { makeImageUploader } from "@/components/admin/hex-editor/uploadObjectImage";
import { KIND_LABELS, SPELL_KIND_OPTIONS, cooldownHint, type SpellDraft } from "./spellDraft";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const CAP = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

export function SpellEditor({
  value,
  onChange,
  onSave,
  saving,
  onClose,
}: {
  value: SpellDraft;
  onChange: (next: SpellDraft) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  const patch = (p: Partial<SpellDraft>) => onChange({ ...value, ...p });
  // Тот же загрузчик, что у объектов карты: одна кнопка, один /api/upload.
  const upload = makeImageUploader(
    (url) => patch({ image: url }),
    () => undefined,
    () => undefined,
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 truncate font-display text-lg font-bold">
            {value.id ? `Правка: ${value.name || "заклинание"}` : "Новое заклинание"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Своя прокрутка тела: на 360×640 форма длиннее экрана. */}
        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <div>
            <span className={CAP}>Картинка</span>
            <button
              type="button"
              onClick={() => void upload("imageUrl")}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs"
            >
              {value.image ? (
                <img src={thumb(value.image, 80)} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">{value.image ? "Сменить" : "Загрузить"}</span>
            </button>
          </div>

          <label className="block">
            <span className={CAP}>Название</span>
            <input
              value={value.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Призыв корабля"
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={CAP}>Описание</span>
            <textarea
              value={value.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Что делает заклинание — игрок прочитает это на столбе"
              rows={2}
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={CAP}>Вид</span>
            <select
              value={value.kind}
              onChange={(e) => patch({ kind: e.target.value as SpellKind })}
              className={FIELD}
            >
              {SPELL_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {value.kind === "boost"
                ? "Вешает на героя эффекты из списка ниже."
                : "Техническое: действие исполняет сервер, эффекты можно не задавать."}
            </span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className={CAP}>Энергия</span>
              <input
                value={value.energyCost}
                onChange={(e) => patch({ energyCost: e.target.value })}
                inputMode="numeric"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={CAP}>Откат, мин</span>
              <input
                value={value.cooldownMinutes}
                onChange={(e) => patch({ cooldownMinutes: e.target.value })}
                inputMode="numeric"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={CAP}>Интеллект</span>
              <input
                value={value.minInt}
                onChange={(e) => patch({ minInt: e.target.value })}
                inputMode="numeric"
                className={FIELD}
              />
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Цена и откат — ПОЛНЫЕ, до скидки за интеллект (
            {cooldownHint(Math.max(0, Math.round(Number(value.cooldownMinutes)) || 0))}). Интеллект
            — порог: ниже него заклинание не выучить и не прочесть.
          </p>

          <BoostEffectsEditor effects={value.effects} onChange={(effects) => patch({ effects })} />

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.active}
              onChange={(e) => patch({ active: e.target.checked })}
              className="h-4 w-4"
            />
            В игре (снятая галочка убирает заклинание из витрин и книг)
          </label>
        </div>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={onSave}
            // «Забвение» с неверной парой «уровень + минуты» не сохраняется (ошибка под ним).
            disabled={saving || !value.name.trim() || !oblivionEffectsOk(value.effects)}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
