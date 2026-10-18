// Копирование в буфер, которое работает и в телеграм-вебвью.
//
// ЗАЧЕМ отдельный модуль: на эталонном девайсе (Xiaomi 13T, вебвью Telegram)
// navigator.clipboard отсутствует или молча отклоняет запись, и кнопка
// «скопировать» ничего не делала. Async-clipboard пробуем первым, дальше —
// старый execCommand через скрытую textarea.
//
// Возвращает false, если не удалось ни тем, ни другим: вызывающий код обязан
// показать текст на экране, чтобы человек мог переписать руками.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* буфер заблокирован окружением — идём в фолбэк */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
