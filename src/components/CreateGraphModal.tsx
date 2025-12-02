import React from 'react';
import { Modal } from '@consta/uikit/Modal';
import { Text } from '@consta/uikit/Text';
import { Button } from '@consta/uikit/Button';
import { TextField } from '@consta/uikit/TextField';
import { Select } from '@consta/uikit/Select';
import { CheckboxGroup } from '@consta/uikit/CheckboxGroup';
import { Badge } from '@consta/uikit/Badge';
import { IconClose } from '@consta/icons/IconClose';

// Define types locally or import if they are shared (assuming they were local in App.tsx or simple enough)
type GraphCopyOption = 'domains' | 'modules' | 'artifacts' | 'experts' | 'initiatives';

interface CreateGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: () => void;
  graphName: string;
  onGraphNameChange: (value: string) => void;
  sourceGraphId: string | null;
  onSourceGraphIdChange: (value: string | null) => void;
  copyOptions: Set<GraphCopyOption>;
  onCopyOptionsChange: (options: Set<GraphCopyOption>) => void;
  isSubmitting: boolean;
  status: { type: 'success' | 'error'; message: string } | null;
  graphOptions: Array<{ label: string; value: string }>;
  sourceGraphDraft?: { name: string; isDefault: boolean };
}

const GRAPH_COPY_ITEMS: Array<{ id: GraphCopyOption; label: string }> = [
  { id: 'domains', label: 'Домены' },
  { id: 'modules', label: 'Модули' },
  { id: 'artifacts', label: 'Артефакты' },
  { id: 'experts', label: 'Эксперты' },
  { id: 'initiatives', label: 'Инициативы' },
];

export const CreateGraphModal: React.FC<CreateGraphModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  graphName,
  onGraphNameChange,
  sourceGraphId,
  onSourceGraphIdChange,
  copyOptions,
  onCopyOptionsChange,
  isSubmitting,
  status,
  graphOptions,
  sourceGraphDraft,
}) => {
  return (
    <Modal isOpen={isOpen} hasOverlay onClickOutside={onClose} onEsc={onClose} title="Создание графа">
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          boxSizing: 'border-box'
        }}
      >
        <Button
          size="s"
          view="clear"
          iconLeft={IconClose}
          onlyIcon
          label="Закрыть"
          onClick={onClose}
          style={{ alignSelf: 'flex-end' }}
        />
        <Text size="l" weight="bold">
          Создание нового графа
        </Text>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TextField
            size="m"
            label="Название графа"
            placeholder="Например, Экспериментальный"
            value={graphName}
            disabled={isSubmitting}
            onChange={(value) => onGraphNameChange(value ?? '')}
            width="full"
          />

          <Select<{ label: string; value: string }>
            size="m"
            label="Копировать данные из"
            items={graphOptions}
            value={graphOptions.find((o) => o.value === sourceGraphId)}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            placeholder="Создать пустой граф"
            disabled={isSubmitting || graphOptions.length <= 0}
            onChange={(option) => {
              const nextSourceId = option?.value ?? null;

              onSourceGraphIdChange(nextSourceId);

              if (nextSourceId === null) {
                onCopyOptionsChange(
                  new Set<GraphCopyOption>(['domains', 'modules', 'artifacts', 'experts', 'initiatives'])
                );
              }
            }}
            width="full"
          />

          {sourceGraphId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Text size="s" weight="semibold">
                Данные для копирования
              </Text>
              <CheckboxGroup
                size="m"
                direction="column"
                items={GRAPH_COPY_ITEMS}
                value={GRAPH_COPY_ITEMS.filter((item) => copyOptions.has(item.id))}
                getItemKey={(item) => item.id}
                getItemLabel={(item) => item.label}
                onChange={(items) => {
                  onCopyOptionsChange(new Set((items ?? []).map((item) => item.id)));
                }}
                disabled={!sourceGraphId || isSubmitting}
              />
              
              {sourceGraphDraft && (
                <Badge
                  size="s"
                  view="filled"
                  status={sourceGraphDraft.isDefault ? 'success' : 'system'}
                  label={
                    sourceGraphDraft.isDefault
                      ? `Источник: ${sourceGraphDraft.name} • основной`
                      : `Источник: ${sourceGraphDraft.name}`
                  }
                />
              )}
            </div>
          )}

          <Text size="xs" view="secondary">
            {sourceGraphId
              ? 'Выберите, какие данные скопировать из выбранного графа.'
              : 'Если источник не выбран, граф создаётся с данными по умолчанию.'}
          </Text>

          {status && (
            <Text size="s" view={status.type === 'error' ? 'alert' : 'success'}>
              {status.message}
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button
            size="m"
            view="ghost"
            label="Отмена"
            onClick={onClose}
            disabled={isSubmitting}
          />
          <Button
            size="m"
            label="Создать граф"
            onClick={onCreate}
            loading={isSubmitting}
            disabled={isSubmitting || !graphName.trim()}
          />
        </div>
      </div>
    </Modal>
  );
};

