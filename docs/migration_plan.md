# План миграции данных по сервисам Graph / Initiatives / Workforce / Auth

Документ фиксирует последовательность действий при переносе данных из монолитной БД в выделенные схемы PostgreSQL микросервисов. План включает режим read-only, выгрузку, загрузку и проверки на стендах.

## Общие допущения
- Источник: монолитная БД `monolith` (PostgreSQL 12+).
- Приёмники: схемы `graph`, `initiatives`, `workforce`, `auth` в кластере PostgreSQL 14+.
- Все команды выполняются с ролевыми учетными данными, у которых есть доступ на чтение в `monolith` и запись в целевые схемы.
- Для dry-run используются резервные БД `monolith_shadow` и `migration_sandbox`, чтобы не трогать боевые данные.

## Глобальный порядок действий
1. **Подготовка окна**
   - Сообщить пользователям о начале работ и перевести монолитные приложения в режим **read-only** (отключить фоновые задания, запретить DML через feature flag или РО-роль).
   - Зафиксировать версию схемы мигрируемых таблиц и выполнить `VACUUM ANALYZE` на источнике, чтобы экспорт шёл по актуальной статистике.
2. **Выгрузка из монолита**
   - Выполнить SQL/ETL из `scripts/migrations/<service>/export_*.sql` с параметром `-v export_dir=/backups`, сохранив CSV с заголовками и контрольную сумму (sha256) для каждого файла.
3. **Загрузка в целевые схемы**
   - Создать временную БД/схему `migration_sandbox` и прогнать `scripts/migrations/<service>/import_*.sql` с параметром `-v import_dir=/backups`, чтобы проверить совместимость типов и ограничений.
4. **Проверки после загрузки**
   - Сравнить количество строк и суммарные контрольные суммы основных колонок между источником и приёмником.
   - Выполнить smoke-запросы, описанные ниже по сервисам.
5. **Разморозка**
   - После успешных smoke-проверок переключить трафик на новые сервисы или разрешить запись в монолите (если используется режим обратной синхронизации).

## Детальный план по сервисам

### Graph
1. **Freeze:** остановить cron-задачи пересчёта графа, перевести UI в read-only (только GET /api/graph/*).
2. **Export:**
   - Запустить `psql -f scripts/migrations/graph/export_graph.sql -v export_dir=/backups` (получатся `graph_nodes.csv` и `graph_edges.csv`).
   - Хешировать результаты: `sha256sum /backups/graph_nodes.csv /backups/graph_edges.csv` и сохранить в журнале миграции.
3. **Import:**
   - Поднять целевой сервис Graph и применить миграционный скрипт: `psql -f scripts/migrations/graph/import_graph.sql -v import_dir=/backups`.
4. **Smoke-проверки:**
   - `SELECT COUNT(*) FROM graph.nodes;`
   - `SELECT COUNT(*) FROM graph.edges WHERE edge_type = 'dependency';`
   - Сэмплировать 10 узлов и сравнить координаты/названия с исходными данными.

### Initiatives
1. **Freeze:** отключить создание/обновление карточек инициатив в монолите, оставить только просмотр.
2. **Export:**
   - `psql -f scripts/migrations/initiatives/export_initiatives.sql -v export_dir=/backups` (файлы `initiatives.csv`, `initiative_modules.csv`).
3. **Import:**
   - `psql -f scripts/migrations/initiatives/import_initiatives.sql -v import_dir=/backups`.
4. **Smoke-проверки:**
   - `SELECT COUNT(*) FROM initiatives.cards WHERE status <> 'archived';`
   - Проверка связей с графом: `SELECT COUNT(*) FROM initiatives.card_modules;`.
   - В UI убедиться, что карточка инициативы содержит список связанных модулей.

### Workforce
1. **Freeze:** заблокировать HR-интеграции и остановить планировщик обновления сотрудников.
2. **Export:**
   - `psql -f scripts/migrations/workforce/export_workforce.sql -v export_dir=/backups` (файлы `workforce_employees.csv`, `workforce_assignments.csv`).
3. **Import:**
   - `psql -f scripts/migrations/workforce/import_workforce.sql -v import_dir=/backups`.
4. **Smoke-проверки:**
   - `SELECT COUNT(*) FROM workforce.employees WHERE active IS TRUE;`
   - `SELECT COUNT(*) FROM workforce.assignments;`
   - Выборочная проверка FTE/компетенций для 5 сотрудников.

### Auth
1. **Freeze:** перевести выдачу токенов в режим только refresh, запретить регистрацию.
2. **Export:**
   - `psql -f scripts/migrations/auth/export_auth.sql -v export_dir=/backups` (файлы `auth_users.csv`, `auth_roles.csv`).
3. **Import:**
   - `psql -f scripts/migrations/auth/import_auth.sql -v import_dir=/backups`.
4. **Smoke-проверки:**
   - `SELECT COUNT(*) FROM auth.users;`
   - Проверить выборочно хэши паролей и роли.
   - Выполнить запрос к `/api/login` и `/api/me` с токеном из новой БД.

## Документация контрольных точек
- Создаётся журнал миграции со временем начала/окончания каждой фазы, именами CSV и контрольными суммами.
- В случае ошибок в импорте фиксируются номера строк и первичные ключи для повторной загрузки.

## Rollback-процедура
1. При ошибках импорта откатить транзакции в `migration_sandbox` и перезапустить импорт из сохранённых CSV.
2. Если ошибки воспроизводятся, вернуть трафик на монолит в режиме read-write и проанализировать несовместимости схемы.
3. После исправления схемы/данных повторить шаги выгрузки и импорта.
