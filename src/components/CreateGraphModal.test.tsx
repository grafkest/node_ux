import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateGraphModal } from './CreateGraphModal';

describe('CreateGraphModal', () => {
  it('shows an error and clears the source selection when the source graph becomes unavailable', () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    const onGraphNameChange = vi.fn();
    const onSourceGraphIdChange = vi.fn();
    const onCopyOptionsChange = vi.fn();

    const graphOptions = [
      { label: 'Доступный граф', value: 'graph-available' },
      { label: 'Основной граф', value: 'graph-default' },
    ];

    const { rerender } = render(
      <CreateGraphModal
        isOpen
        onClose={onClose}
        onCreate={onCreate}
        graphName="Новый граф"
        onGraphNameChange={onGraphNameChange}
        sourceGraphId="stale-id"
        onSourceGraphIdChange={onSourceGraphIdChange}
        copyOptions={new Set(['domains', 'modules'])}
        onCopyOptionsChange={onCopyOptionsChange}
        isSubmitting={false}
        status={null}
        graphOptions={graphOptions}
      />
    );

    expect(
      screen.getByText('Выберите, какие данные скопировать из выбранного графа.')
    ).toBeInTheDocument();

    rerender(
      <CreateGraphModal
        isOpen
        onClose={onClose}
        onCreate={onCreate}
        graphName="Новый граф"
        onGraphNameChange={onGraphNameChange}
        sourceGraphId={null}
        onSourceGraphIdChange={onSourceGraphIdChange}
        copyOptions={new Set(['domains', 'modules'])}
        onCopyOptionsChange={onCopyOptionsChange}
        isSubmitting={false}
        status={{
          type: 'error',
          message: 'Выбранный источник графа больше недоступен. Выберите другой граф.',
        }}
        graphOptions={graphOptions}
      />
    );

    expect(
      screen.getByText('Если источник не выбран, граф создаётся с данными по умолчанию.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Выбранный источник графа больше недоступен. Выберите другой граф.')
    ).toBeInTheDocument();
  });
});
