# Задача 8: Реализация микросервисной архитектуры с PostgreSQL

## Проблема
Монолит объединяет граф доменов, инициативы, управление сотрудниками и авторизацию. Это усложняет раздельное обновление сервисов и сохранение данных при релизах.

## Цель
Поэтапно развернуть микросервисы для графа, инициатив, сотрудников и аутентификации, сохранив текущие функции через API и обеспечив хранение в PostgreSQL.

## План действий

1. **Инфраструктурная подготовка (PostgreSQL и общие инструменты)**
    * Развернуть PostgreSQL с отдельными схемами/базами для Graph, Initiatives, Workforce, Auth.
    * Настроить миграции (Prisma/Knex/sequelize) и общий Docker Compose с volume для данных.
    * Добавить общий healthcheck `/health` и логику автоприменения миграций при деплое.

2. **Выделение Graph Service**
    * Создать новый Express-сервис с REST маршрутами `/graphs`, `/graphs/{id}`, `/graphs/{id}/snapshots` (совместимый контракт).
    * Моделировать таблицы: `graphs`, `domains`, `modules`, `artifacts`, `relations`, `layouts`, `snapshots` (layout и метаданные в JSONB).
    * Ввести генерацию стабильных `nodeId` для узлов и публиковать событие `graph.published` при сохранении снапшота.

3. **Выделение Initiative Planning Service**
    * Создать сервис с CRUD по `/initiatives`, `/initiatives/{id}`, `/initiatives/{id}/milestones` и фильтрацией по `graphId`/узлам.
    * Таблицы: `initiatives`, `milestones`, `links_to_graph (initiativeId, nodeId, nodeType)`, `risks`.
    * Реализовать проверку существования `nodeId` через BFF/Graph API и реакцию на событие `graph.published` для валидации связей.

4. **Выделение Workforce/Experts Service**
    * Поднять сервис с маршрутами `/employees`, `/employees/{id}`, `/employees/{id}/skills`, `/assignments`.
    * Таблицы: `employees`, `skills`, `employee_skills`, `assignments (employeeId, initiativeId, role, load)`, `availability`.
    * Хранить только ссылки `initiativeId` и полагаться на BFF для агрегации информации о домене/модуле.

5. **Identity/Auth Service**
    * Реализовать выдачу JWT (`POST /login`, `POST /refresh`) и CRUD пользователей `/users` с ролями/правами.
    * Таблицы: `users`, `roles`, `permissions`, `login_audit`.
    * Настроить общую библиотеку проверки JWT или JWKS для остальных сервисов; писать аудит логинов.

6. **API Gateway / BFF**
    * Сконфигурировать маршруты проксирования: `/api/login`, `/api/users/*` → Auth; `/api/graphs/*` → Graph; `/api/initiatives/*` → Initiatives; `/api/employees/*`, `/api/assignments/*` → Workforce.
    * Добавить агрегацию для клиентских ответов (например, `GET /api/initiatives/{id}` собирает ссылки на узлы и назначения сотрудников).
    * Включить CORS, rate limiting, кеширование справочников и метрик.

7. **Миграция и поэтапный релиз**
    * Вытянуть текущие данные монолита в миграции для каждого сервиса (скрипты экспорта/импорта).
    * Перевести фронтенд на `/api/*` через BFF, сохраняя обратную совместимость на время миграции.
    * Настроить CI/CD: прогон миграций, деплой сервисов, smoke-тесты REST контрактов, мониторинг событий `graph.published`.

## Критерии готовности (Definition of Done)
- Все сервисы поднимаются через docker-compose с сохранением данных в volume PostgreSQL и успешно проходят healthcheck `/health`.
- Graph/Initiatives/Workforce/Auth имеют миграции, применяемые при старте, и выдают стабильные `nodeId`/`initiativeId` через неизменённые REST контракты.
- BFF проксирует все маршруты `/api/*`, добавляет агрегацию для карточки инициативы и проверяет JWT из Auth.
- CI/CD прогоняет миграции, smoke-тесты основных эндпоинтов и мониторит событие `graph.published`.

## Ожидаемый результат
* Разделённые сервисы с автономными БД и миграциями, сохраняющие данные между релизами.
* Стабильные идентификаторы узлов графа, используемые инициативами и назначениями сотрудников.
* BFF скрывает распределённость и обеспечивает агрегированные ответы для фронтенда.
