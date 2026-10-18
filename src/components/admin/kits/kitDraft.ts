// Черновик формы набора: поля строками (как их отдаёт ввод) ↔ поля для
// сервера (KitFields). Чистая логика без React — под тест. Проверка — общий
// kitError, тем же ключом отказывает и сервер.
import { kitError, type KitAdminRow, type KitFields } from "@/lib/kits";

/** Выбранный бокс: id для сервера, имя и обложка — показать в форме. */
export type KitBoxRef = { id: string; name: string; image: string | null };

export type KitDraft = {
  id: string | null;
  box: KitBoxRef | null;
  boxCount: string;
  priceUsd: string;
  stock: string;
  perAccount: string;
  active: boolean;
};

export const emptyKitDraft = (): KitDraft => ({
  id: null,
  box: null,
  boxCount: "1",
  priceUsd: "",
  stock: "",
  perAccount: "",
  active: false,
});

export const draftOfKit = (k: KitAdminRow): KitDraft => ({
  id: k.id,
  box: { id: k.boxId, name: k.boxName, image: k.boxImage },
  boxCount: String(k.boxCount),
  priceUsd: String(k.priceUsd),
  stock: k.stock == null ? "" : String(k.stock),
  perAccount: k.perAccount == null ? "" : String(k.perAccount),
  active: k.active,
});

/** Число из поля: запятая — как точка, мусор — NaN (его поймает kitError). */
const numOf = (raw: string): number => {
  const s = raw.trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
};
/** Необязательное поле: пусто — null («без тиража», «без лимита»). */
const optOf = (raw: string): number | null => (raw.trim() === "" ? null : numOf(raw));

export const fieldsOfDraft = (d: KitDraft): KitFields => ({
  boxId: d.box?.id ?? "",
  boxCount: numOf(d.boxCount),
  priceUsd: numOf(d.priceUsd),
  stock: optOf(d.stock),
  perAccount: optOf(d.perAccount),
  active: d.active,
});

/** Первая ошибка формы ключом kits.err_* или null — можно сохранять. */
export const kitDraftError = (d: KitDraft): string | null => kitError(fieldsOfDraft(d));

/** Тело adminKitSave. Звать после kitDraftError === null. */
export const kitSavePayload = (d: KitDraft): KitFields & { id?: string } => ({
  ...(d.id ? { id: d.id } : {}),
  ...fieldsOfDraft(d),
});
