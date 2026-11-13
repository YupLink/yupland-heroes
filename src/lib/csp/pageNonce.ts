// Метка (nonce) этой страницы — на клиенте, для кода, который сам собирает
// встроенные скрипты: окна NEAR-кошельков (@hot-labs/near-connect) пишут их в
// iframe srcdoc, а такой iframe живёт под защитным заголовком страницы
// (cspPolicy.ts). Без метки браузер их не запустит (отчёты 11.11: 154 пары).
// Атрибут nonce браузер прячет (getAttribute → ""), свойство .nonce — нет.
export function pageNonce(): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script"))) {
    if (s.nonce) return s.nonce;
  }
  return undefined;
}
