// Общая подготовка тестов: НИ ОДИН тест не ходит наружу.
//
// База у проекта одна и она боевая: в ней живые кошельки, деньги и позиции
// игроков. Тест, случайно дотянувшийся до неё пишущим запросом, стоит дороже
// всей пользы от тестов, поэтому дорога перекрыта на двух рубежах.
//
// Рубеж первый — адреса. Мост к базе (server/db/mcpClient) и прямой канал
// (directPg) берут их из окружения; пустое окружение само по себе никуда не
// ведёт. Чистим ДО импорта модулей, иначе они успеют прочитать значения.
//
// Рубеж второй — сама сеть: fetch падает с внятной ошибкой. Если тест куда-то
// пошёл, он обязан упасть с «походом в сеть», а не молча получить данные.
const DB_ENV = [
  "MCP_DB_URL",
  "MCP_DB_TOKEN",
  "DIRECT_DATABASE_URL",
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of DB_ENV) delete process.env[key];

globalThis.fetch = ((input: unknown) => {
  const where = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
  return Promise.reject(
    new Error(`Поход в сеть из теста запрещён: ${where}. Подмени модуль заглушкой (vi.mock).`),
  );
}) as typeof fetch;
