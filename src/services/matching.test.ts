import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInitiativeMatchReport,
  type InitiativeRequirement,
  type MatchableExpertProfile,
  type RoleRequirement,
  scoreExpertForRole
} from './matching';

function createExpert(overrides: Partial<MatchableExpertProfile>): MatchableExpertProfile {
  const base: MatchableExpertProfile = {
    id: 'expert-base',
    fullName: 'Эксперт Базовый',
    title: 'Lead Engineer',
    summary: 'Опытный специалист.',
    domains: ['core'],
    modules: [],
    competencies: [],
    consultingSkills: [],
    softSkills: [],
    focusAreas: [],
    experienceYears: 10,
    location: 'Москва',
    contact: 'expert@example.com',
    languages: ['ru'],
    notableProjects: [],
    availability: 'available',
    availabilityComment: 'Готов к новым проектам',
    skillEvidence: []
  } as MatchableExpertProfile;

  // Spread overrides afterwards to allow array overrides.
  return {
    ...base,
    ...overrides,
    // Deep merge arrays when not provided in overrides
    competencies: overrides.competencies ?? base.competencies,
    consultingSkills: overrides.consultingSkills ?? base.consultingSkills,
    softSkills: overrides.softSkills ?? base.softSkills,
    focusAreas: overrides.focusAreas ?? base.focusAreas,
    languages: overrides.languages ?? base.languages,
    skillEvidence: overrides.skillEvidence ?? base.skillEvidence
  };
}

function assertApproximately(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be approximately ${expected}`
  );
}

test('scoreExpertForRole даёт 100% при полном совпадении навыков', () => {
  const requirement: RoleRequirement = {
    roleId: 'role-ts',
    roleName: 'Frontend Lead',
    requiredFte: 1,
    skills: [
      { name: 'TypeScript', weight: 0.6, requiredLevel: 'advanced', freshnessHalfLifeDays: 180 },
      { name: 'React', weight: 0.4, requiredLevel: 'advanced', freshnessHalfLifeDays: 90 }
    ]
  };

  const expert = createExpert({
    id: 'expert-ts',
    fullName: 'Алексей TypeScript',
    competencies: ['TypeScript', 'React'],
    availability: 'available',
    skillEvidence: [
      { id: 'typescript', name: 'TypeScript', level: 'expert', lastUsedDaysAgo: 30 },
      { id: 'react', name: 'React', level: 'advanced', lastUsedDaysAgo: 200 }
    ]
  });

  const { explanation } = scoreExpertForRole(requirement, expert);

  assertApproximately(explanation.normalizedSkillScore, 1, 1e-6);
  assertApproximately(explanation.availabilityMultiplier, 1);
  assertApproximately(explanation.fteSaturation, 1);
  assertApproximately(explanation.totalScore, 1, 1e-6);

  const reactRisk = explanation.risks.find((risk) => risk.includes('React'));
  assert.ok(reactRisk, 'Ожидался риск по устареванию навыка React');
});

test('scoreExpertForRole рассчитывает покрытие навыков по количеству совпадений', () => {
  const requirement: RoleRequirement = {
    roleId: 'role-data',
    roleName: 'Data Engineer',
    requiredFte: 1,
    skills: [
      { name: 'Python', weight: 0.5, requiredLevel: 'advanced', freshnessHalfLifeDays: 120 },
      { name: 'Airflow', weight: 0.5, requiredLevel: 'advanced', freshnessHalfLifeDays: 120 }
    ]
  };

  const expert = createExpert({
    id: 'expert-partial',
    skillEvidence: [{ id: 'python', name: 'Python', level: 'advanced', lastUsedDaysAgo: 10 }],
    competencies: ['Python']
  });

  const { explanation } = scoreExpertForRole(requirement, expert);

  assertApproximately(explanation.normalizedSkillScore, 0.5, 1e-6);
  assertApproximately(explanation.availabilityMultiplier, 1, 1e-6);
  assertApproximately(explanation.fteSaturation, 1, 1e-6);
  assertApproximately(explanation.totalScore, 0.5, 1e-6);
});

test('buildInitiativeMatchReport агрегирует оценки по ролям инициативы', () => {
  const experts: MatchableExpertProfile[] = [
    createExpert({
      id: 'expert-alpha',
      fullName: 'Frontend Специалист',
      skillEvidence: [{ id: 'typescript', name: 'TypeScript', level: 'expert', lastUsedDaysAgo: 5 }],
      competencies: ['TypeScript'],
      availability: 'available'
    }),
    createExpert({
      id: 'expert-beta',
      fullName: 'Data Аналитик',
      skillEvidence: [{ id: 'dataops', name: 'DataOps', level: 'advanced', lastUsedDaysAgo: 400 }],
      focusAreas: ['DataOps'],
      availability: 'partial'
    })
  ];

  const initiative: InitiativeRequirement = {
    initiativeId: 'initiative-1',
    initiativeName: 'Цифровой апстрим',
    roles: [
      {
        roleId: 'role-frontend',
        roleName: 'Frontend Lead',
        requiredFte: 1,
        skills: [{ name: 'TypeScript', weight: 1, requiredLevel: 'advanced', freshnessHalfLifeDays: 120 }]
      },
      {
        roleId: 'role-dataops',
        roleName: 'DataOps инженер',
        requiredFte: 0.5,
        skills: [{ name: 'DataOps', weight: 1, requiredLevel: 'advanced', freshnessHalfLifeDays: 180 }]
      }
    ]
  };

  const report = buildInitiativeMatchReport(initiative, experts);
  assert.equal(report.roleReports.length, 2);

  const frontendReport = report.roleReports[0];
  assert.equal(frontendReport.topMatch?.expert.id, 'expert-alpha');
  assert.ok(frontendReport.topMatch!.explanation.totalScore > 0.8);

  const dataOpsReport = report.roleReports[1];
  assert.equal(dataOpsReport.topMatch?.expert.id, 'expert-beta');
  assertApproximately(dataOpsReport.topMatch!.explanation.totalScore, 1, 1e-6);

  const expectedOverall =
    (frontendReport.topMatch!.explanation.totalScore +
      dataOpsReport.topMatch!.explanation.totalScore) /
    2;
  assertApproximately(report.overallScore, expectedOverall, 1e-6);
});
