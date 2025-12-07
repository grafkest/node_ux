import { Button } from '@consta/uikit/Button';
import { Checkbox } from '@consta/uikit/Checkbox';
import { CheckboxGroup } from '@consta/uikit/CheckboxGroup';
import { Combobox } from '@consta/uikit/Combobox';
import { Switch } from '@consta/uikit/Switch';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import clsx from 'clsx';
import React from 'react';
import type { ComboboxPropRenderItem } from '@consta/uikit/Combobox';
import type { ModuleStatus } from '../../data';
import styles from './FiltersPanel.module.css';

type FiltersPanelProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statuses: ModuleStatus[];
  activeStatuses: Set<ModuleStatus>;
  onToggleStatus: (status: ModuleStatus) => void;
  products: string[];
  productFilter: string[];
  onProductChange: (products: string[]) => void;
  companies: string[];
  companyFilter: string | null;
  onCompanyChange: (company: string | null) => void;
  showAllConnections: boolean;
  onToggleConnections: (value: boolean) => void;
};

const statusLabels: Record<ModuleStatus, string> = {
  'in-dev': 'В разработке',
  production: 'В эксплуатации',
  deprecated: 'Устаревший'
};

type StatusOption = {
  id: ModuleStatus;
  label: string;
};

const FiltersPanel: React.FC<FiltersPanelProps> = ({
  search,
  onSearchChange,
  statuses,
  activeStatuses,
  onToggleStatus,
  products,
  productFilter,
  onProductChange,
  companies,
  companyFilter,
  onCompanyChange,
  showAllConnections,
  onToggleConnections
}) => {
  const statusOptions = React.useMemo(
    () =>
      statuses.map<StatusOption>((status) => ({
        id: status,
        label: statusLabels[status]
      })),
    [statuses]
  );

  const selectedStatusOptions = React.useMemo(
    () => statusOptions.filter((option) => activeStatuses.has(option.id)),
    [statusOptions, activeStatuses]
  );

  const renderProductOption = React.useCallback<ComboboxPropRenderItem<string>>(
    ({ item, active, hovered, onClick, onMouseEnter, ref }) => (
      <div
        ref={ref}
        className={clsx(styles.comboboxOption, {
          [styles.comboboxOptionHovered]: hovered,
          [styles.comboboxOptionActive]: active
        })}
        onMouseEnter={onMouseEnter}
        onClick={(event) => {
          onClick(event);
        }}
      >
        <Checkbox
          size="s"
          readOnly
          checked={productFilter.includes(item)}
          label={item}
          className={styles.comboboxCheckbox}
        />
      </div>
    ),
    [productFilter]
  );

  return (
    <div className={styles.filters}>
      <div className={styles.section}>
        <TextField
          width="full"
          size="s"
          value={search}
          onChange={(payload) => {
            const nextValue = (() => {
              if (typeof payload === 'string') {
                return payload;
              }

              if (payload && typeof payload === 'object') {
                const withValue = payload as { value?: unknown };
                if (typeof withValue.value === 'string') {
                  return withValue.value;
                }

                const eventTargetValue =
                  (payload as { e?: { target?: { value?: unknown } } }).e?.target
                    ?.value;
                if (typeof eventTargetValue === 'string') {
                  return eventTargetValue;
                }
              }

              return '';
            })();

            onSearchChange(nextValue);
          }}
          placeholder="Поиск модулей..."
          leftSide={IconSearchStroked}
          withClearButton={Boolean(search)}
          onClear={() => onSearchChange('')}
        />
      </div>

      <div className={styles.section}>
        <Text size="xs" weight="bold" transform="uppercase" view="secondary" className={styles.sectionTitle}>
          Статус
        </Text>
        <div className={styles.statusFilters}>
          {statusOptions.map((status) => {
            const isActive = activeStatuses.has(status.id);
            return (
              <Button
                key={status.id}
                size="xs"
                view={isActive ? 'primary' : 'ghost'}
                label={status.label}
                onClick={() => onToggleStatus(status.id)}
                className={styles.statusChip}
              />
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <Text size="xs" weight="bold" transform="uppercase" view="secondary" className={styles.sectionTitle}>
          Продукты и Компании
        </Text>
        <div className={styles.formStack}>
          <Combobox
            placeholder="Все продукты"
            size="s"
            items={products}
            value={productFilter}
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => onProductChange(value ?? [])}
            multiple
            renderItem={renderProductOption}
            className={styles.combobox}
            label="Продукт"
            labelPosition="top"
          />
          <Combobox
            placeholder="Все компании"
            size="s"
            items={companies}
            value={companyFilter}
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => onCompanyChange(value ?? null)}
            className={styles.combobox}
            label="Компания"
            labelPosition="top"
          />
        </div>
      </div>

      <div className={styles.section}>
        <Text size="xs" weight="bold" transform="uppercase" view="secondary" className={styles.sectionTitle}>
          Настройки графа
        </Text>
        <Switch
          checked={showAllConnections}
          onChange={({ target }) => onToggleConnections(target.checked)}
          label="Все связи"
          size="s"
          className={styles.switch}
        />
      </div>

      <div className={styles.resetSection}>
        <Button
          size="s"
          view="ghost"
          width="full"
          label="Сбросить все фильтры"
          onClick={() => {
            onSearchChange('');
            onProductChange(products);
            onCompanyChange(null);
            statuses.forEach((status) => {
              if (!activeStatuses.has(status)) {
                onToggleStatus(status);
              }
            });
          }}
        />
      </div>
    </div>
  );
};

export default FiltersPanel;
