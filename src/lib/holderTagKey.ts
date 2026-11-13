// Ключ react-query метки DARAI холдеров — отдельно от компонента, чтобы ключи банка
// (bankKeys.ts грузится вместе со сценой замка) не тянули окно вывода в основной чанк.
export const HOLDER_TAG_KEY = ["my-holder-darai"] as const;
