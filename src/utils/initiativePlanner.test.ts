import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { preparePlannerModuleSelections } from './initiativePlanner';

describe('preparePlannerModuleSelections', () => {
  it('trims blank entries and returns deduplicated modules', () => {
    const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections([
      ' module-a ',
      'module-b',
      'module-a',
      '',
      '   '
    ]);

    assert.deepEqual(potentialModules, ['module-a', 'module-b']);
    assert.deepEqual(plannedModuleIds, ['module-a', 'module-b']);
  });

  it('handles empty inputs', () => {
    const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections([]);

    assert.deepEqual(potentialModules, []);
    assert.deepEqual(plannedModuleIds, []);
  });
});
