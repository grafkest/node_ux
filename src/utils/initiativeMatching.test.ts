import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoleMatchReports,
  type RolePlanningDraft
} from './initiativeMatching';
import type { ExpertProfile } from '../data';

const baseExpert: ExpertProfile = {
  id: 'expert-1',
  fullName: 'Тестовый Эксперт',
  title: 'Специалист',
  summary: 'Описание эксперта',
  domains: [],
  modules: [],
  competencies: [],
  consultingSkills: [],
  softSkills: [],
  focusAreas: [],
  experienceYears: 5,
  location: 'Москва',
  contact: 'expert@example.com',
  languages: ['ru'],
  notableProjects: [],
  availability: 'available',
  availabilityComment: '',
  skills: []
};

describe('buildRoleMatchReports', () => {
  it('includes work item skills in role requirements and scoring', () => {
    const role: RolePlanningDraft = {
      id: 'role-1',
      role: 'Аналитик',
      required: 1,
      skills: [],
      workItems: [
        {
          id: 'work-1',
          title: 'Исследование',
          description: 'Аналитическая задача',
          startDay: 0,
          durationDays: 5,
          effortDays: 5,
          tasks: ['Оптимизация размещения инфраструктуры']
        }
      ]
    };

    const expert: ExpertProfile = {
      ...baseExpert,
      competencies: ['Оптимизация размещения инфраструктуры']
    };

    const [report] = buildRoleMatchReports([role], [expert]);

    assert.ok(report, 'Report should be generated');
    assert.deepEqual(report.requirement.skills.map((skill) => skill.name), [
      'Оптимизация размещения инфраструктуры'
    ]);
    assert.deepEqual(report.requirement.skills.map((skill) => skill.id), ['layout-optimization']);

    const [match] = report.matches;
    assert.ok(match, 'Match should be calculated for the expert');
    assert.ok(
      match.explanation.normalizedSkillScore > 0,
      'Skill score should reflect provided task skill'
    );
  });

  it('maps task identifiers to catalog skills for ranking', () => {
    const role: RolePlanningDraft = {
      id: 'role-2',
      role: 'Аналитик',
      required: 1,
      skills: [],
      workItems: [
        {
          id: 'work-2',
          title: 'Нормализация',
          description: 'Приведение источников к модели данных',
          startDay: 0,
          durationDays: 10,
          effortDays: 10,
          tasks: ['data-normalization']
        }
      ]
    };

    const expert: ExpertProfile = {
      ...baseExpert,
      id: 'expert-data',
      skills: [
        {
          id: 'data-normalization',
          level: 'A',
          proofStatus: 'validated',
          evidence: [
            {
              status: 'validated',
              initiativeId: 'initiative-digital-pad',
              artifactIds: ['artifact-data-normalization'],
              comment: 'Подтверждено на проектах инфра-планирования'
            }
          ],
          artifacts: [],
          interest: 'high',
          availableFte: 0.5,
          usage: { from: '2024-01-01' }
        }
      ]
    };

    const [report] = buildRoleMatchReports([role], [expert]);
    assert.ok(report.requirement.skills[0]?.id === 'data-normalization');
    assert.equal(report.requirement.skills[0]?.name, 'Подготовка и нормализация данных');

    const [match] = report.matches;
    assert.ok(match, 'Match should exist for expert with matching skill evidence');
    assert.ok(
      match.explanation.normalizedSkillScore > 0.05,
      'Expected skill score to be greater than zero for matching evidence'
    );
    assert.ok(
      match.explanation.totalScore > 0.01,
      'Total score should reflect matching skill and availability'
    );
  });
});

