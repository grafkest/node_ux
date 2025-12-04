# Задача 1: Выделение глобального состояния в Context API

## Проблема
В данный момент компонент `App.tsx` управляет всем состоянием приложения (более 4700 строк). Это нарушает принцип единственной ответственности, усложняет чтение кода и приводит к лишним ре-рендерам всего дерева компонентов при изменении любого состояния.

## Цель
Вынести управление состоянием из `App.tsx` в специализированные провайдеры React Context.

## План действий

1.  **Создать `GraphDataContext`**
    *   **Файл:** `src/context/GraphDataContext.tsx`
    *   **Состояние:**
        *   `graphs`, `activeGraphId`
        *   `domainData`, `moduleData`, `artifactData`, `initiativeData`, `expertProfiles`
        *   `layoutPositions`
        *   Методы загрузки и сохранения снимков (`loadSnapshot`, `applySnapshot`)
    *   **Действия:** Перенести логику `useEffect` и `useCallback`, связанных с загрузкой графа.

2.  **Создать `UIContext`**
    *   **Файл:** `src/context/UIContext.tsx`
    *   **Состояние:**
        *   `themeMode`
        *   `sidebarBaseHeight`
        *   `isDomainTreeOpen`, `areFiltersOpen`
        *   `adminNotice` (системные уведомления)
        *   `isCreatePanelOpen` (модальные окна)
    *   **Действия:** Перенести логику измерения сайдбара и управления темой.

3.  **Создать `FilterContext`**
    *   **Файл:** `src/context/FilterContext.tsx`
    *   **Состояние:**
        *   `search`
        *   `statusFilters`
        *   `productFilter`, `companyFilter`
        *   `selectedDomains`
        *   `selectedNode`
    *   **Действия:** Вынести логику фильтрации и поиска.

4.  **Рефакторинг `App.tsx`**
    *   Обернуть приложение в созданные провайдеры:
        ```tsx
        <AuthProvider>
          <UIProvider>
            <GraphDataProvider>
              <FilterProvider>
                <LayoutShell ... />
              </FilterProvider>
            </GraphDataProvider>
          </UIProvider>
        </AuthProvider>
        ```
    *   Удалить перенесенный код из `App.tsx`.

## Ожидаемый результат
*   Размер `App.tsx` уменьшится на ~1500-2000 строк.
*   Логика управления данными будет изолирована от логики отображения.
*   Уменьшится количество пропсов, передаваемых через `LayoutShell`.
