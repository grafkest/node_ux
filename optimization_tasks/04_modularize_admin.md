# Задача 4: Модуляризация панели администратора

## Проблема
Административная панель (`AdminPanel`) и управление сохранением графа (`GraphPersistenceControls`) смешаны с основной логикой приложения. Логика создания/редактирования сущностей (CRUD) находится в `App.tsx` или передается через глубокое дерево пропсов.

## Цель
Выделить административный функционал в отдельный модуль.

## План действий

1.  **Создать структуру папок**
    *   `src/features/admin/`
    *   `src/features/admin/components/`
    *   `src/features/admin/services/` (API вызовы для админки)

2.  **Перенос компонентов**
    *   Перенести `AdminPanel` в `src/features/admin/AdminPanel.tsx`.
    *   Перенести `GraphPersistenceControls` в `src/features/admin/components/PersistenceControls.tsx`.
    *   Перенести модальные окна создания (если они есть отдельно) в эту папку.

3.  **Изоляция API вызовов**
    *   Создать хуки `useAdminActions` (create/update/delete для модулей, доменов, пользователей).
    *   Убрать прямые вызовы `fetch` из `App.tsx` (функции `handleCreateUser`, `handleUpdateUser` и т.д.).

4.  **Создать `AdminPage`**
    *   Компонент-страница, который объединяет `PersistenceControls` и `AdminPanel`.
    *   Подключается к роутеру по пути `/admin`.

## Ожидаемый результат
*   Весь административный код (UI и логика) находится в `src/features/admin`.
*   `App.tsx` освобождается от десятков функций-обработчиков (`handleCreate...`, `handleUpdate...`).
*   Четкое разделение прав доступа (защита роута `/admin`).
