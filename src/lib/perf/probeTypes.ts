// Форма пробы с клиента: что телефон игрока сообщает о своей нагрузке.
//
// Общая для сборщика (lib/perf/clientProbe), приёмника (routes/api.perf-client)
// и сводки (server/perf/clientStore). Все числа — уже агрегаты за окно в
// ~минуту: сырые кадры наружу не едут, проба весит сотни байт.
export type FnStat = {
  /** Вызовов за окно. */
  n: number;
  /** Медиана и худшее время ответа глазами клиента, мс. */
  p50: number;
  max: number;
  /** Байт распакованного ответа: всего за окно и худший. */
  bytes: number;
  bytes_max: number;
  /** Байт по проводу (сжато) — всего за окно. */
  wire: number;
};

export type ClientSample = {
  v: 1;
  /** Длина окна замера, мс. */
  dur: number;
  /** Сколько секунд экран рейда открыт. */
  page: number;
  mobile: boolean;
  dpr: number;
  cores: number | null;
  /** navigator.deviceMemory, ГБ (Chrome/Android). */
  mem: number | null;
  /** navigator.connection.effectiveType. */
  conn: string | null;
  /** Размер видимой области, CSS px. */
  screen: string;
  frames: {
    n: number;
    /** Из них — кадры при движении камеры/героя. */
    moving: number;
    /** Время кадра, мс. */
    p50: number;
    p95: number;
    max: number;
    /** Клеток в кадре. */
    cells_p50: number;
    cells_max: number;
  };
  /** Длинные задачи (>50 мс) главного потока: сколько, суммарно и худшая, мс. */
  long: { n: number; total: number; max: number };
  /** JS-куча, МБ (только Chrome). */
  heap: { used: number; peak: number } | null;
  /** Серверные вызовы глазами клиента, по имени функции. */
  fn: Record<string, FnStat>;
  /** События живого потока (SSE), принятые за окно, по типам. */
  sse: Record<string, number>;
};
