// Форма письма: заголовок и текст (RU | EN), картинка (загрузка файлом, как везде), кому, «показывать до»;
// «Предпросмотр» — то самое окно, что увидит игрок, на выбранном языке;
// «Сохранить» (новое письмо всем — «Отправить всем»: сохранение и есть рассылка).
//
// Окно — как форма турниров: снизу листом на телефоне, у верха на ПК; шапка и
// кнопки закреплены, тело прокручивается своё. Ошибку показываем после первой
// попытки сохранить — пустая новая форма не должна сразу ругаться.
import { useState } from "react";
import { Eye, Loader2, Save, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { LetterAudienceInput } from "@/lib/letters";
import { LetterWindow } from "@/components/letters/LetterWindow";
import { UtcDateTimeInput } from "@/components/admin/UtcDateTimeInput";
import { ImageUploader } from "@/components/ImageUploader";
import { CAP, FIELD } from "./letterCls";
import { LetterTextFields } from "./LetterTextFields";
import { draftError, previewOf, sendsToAll, type LetterDraft } from "./letterDraft";
const AUDIENCES: Array<{ id: LetterAudienceInput; key: string }> = [
  { id: "me", key: "letter.adm.to_me" },
  { id: "all", key: "letter.adm.to_all" },
  { id: "list", key: "letter.adm.to_list" },
];

export function LetterEditor({
  value,
  onChange,
  onSave,
  saving,
  onClose,
  previewOnOpen = false,
}: {
  value: LetterDraft;
  onChange: (next: LetterDraft) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
  /** Сразу открыть предпросмотр — так генератор показывает готовое письмо. */
  previewOnOpen?: boolean;
}) {
  const t = useT();
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState(previewOnOpen);
  const patch = (p: Partial<LetterDraft>) => onChange({ ...value, ...p });
  const err = draftError(value);
  const shown = previewOf(value);
  const toAll = sendsToAll(value);

  const submit = () => {
    setTried(true);
    if (!err) onSave();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-start sm:p-4 sm:pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 truncate font-display text-lg font-bold">
            {value.id ? t("letter.adm.edit_title") : t("letter.adm.new")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("letter.adm.close")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <LetterTextFields value={value} onPatch={patch} />
          <div>
            <span className={CAP}>{t("letter.adm.f_image")}</span>
            <ImageUploader
              value={value.image || null}
              onChange={(url) => patch({ image: url ?? "" })}
              placeholder={t("letter.adm.f_image_drop")}
            />
          </div>

          <div>
            <span className={CAP}>{t("letter.adm.f_to")}</span>
            <div className="grid grid-cols-3 gap-1">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => patch({ audience: a.id })}
                  className={cn(
                    "h-10 rounded-lg border px-2 text-sm font-medium transition",
                    value.audience === a.id
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(a.key)}
                </button>
              ))}
            </div>
          </div>

          {value.audience === "list" && (
            <label className="block">
              <span className={CAP}>{t("letter.adm.f_accounts")}</span>
              <textarea
                value={value.accountsText}
                rows={3}
                onChange={(e) => patch({ accountsText: e.target.value })}
                className={cn(FIELD, "resize-y py-2 font-mono text-sm")}
              />
            </label>
          )}

          <div>
            <label htmlFor="letter-until" className={CAP}>
              {t("letter.adm.f_until")}
            </label>
            <UtcDateTimeInput
              id="letter-until"
              value={value.showUntil}
              onChange={(v) => patch({ showUntil: v })}
              clearLabel={t("letter.adm.clear")}
              className={cn(FIELD, "h-10")}
            />
          </div>

          {value.id && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.again}
                onChange={(e) => patch({ again: e.target.checked })}
                className="h-4 w-4 accent-gold"
              />
              {t("letter.adm.again")}
            </label>
          )}
        </div>

        <div className="space-y-2 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          {tried && err && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t(err)}
            </p>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              onClick={() => setPreview(true)}
              disabled={!shown.title && !shown.body}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> {t("letter.adm.preview")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex h-11 items-center justify-center gap-2 rounded-xl gradient-gold font-semibold text-gold-foreground disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : toAll ? (
                <Send className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t(toAll ? "letter.adm.send_all" : "letter.adm.save")}
            </button>
          </div>
        </div>
      </div>

      {preview && (
        <div onClick={(e) => e.stopPropagation()}>
          <LetterWindow letter={shown} onOk={() => setPreview(false)} />
        </div>
      )}
    </div>
  );
}
