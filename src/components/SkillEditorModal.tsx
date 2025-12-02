import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { Select } from '@consta/uikit/Select';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconClose } from '@consta/icons/IconClose';
import React, { useEffect, useMemo, useState } from 'react';
import {
  type ExpertProfile,
  type ExpertSkill,
  type SkillEvidenceRecord,
  type SkillEvidenceStatus,
  type SkillLevel,
  initiatives
} from '../data';
import { getSkillNameById } from '../data/skills';
import styles from './SkillEditorModal.module.css';

type SkillEditorModalProps = {
  expert: ExpertProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (skills: ExpertSkill[]) => void | Promise<void>;
};

type SelectOption<Value> = {
  label: string;
  value: Value;
};

const skillLevelLabels: Record<SkillLevel, string> = {
  A: 'A — Awareness',
  W: 'W — Working',
  P: 'P — Practitioner',
  Ad: 'Ad — Advanced',
  E: 'E — Expert'
};

const proofStatusLabels: Record<SkillEvidenceStatus, string> = {
  claimed: 'Заявлено',
  screened: 'На скрининге',
  observed: 'Подтверждено наблюдением',
  validated: 'Подтверждено',
  refuted: 'Опровергнуто'
};

const skillLevelOrder: SkillLevel[] = ['A', 'W', 'P', 'Ad', 'E'];

const skillLevelOptions: SelectOption<SkillLevel>[] = skillLevelOrder.map((value) => ({
  value,
  label: skillLevelLabels[value]
}));

const proofStatusOptions: SelectOption<SkillEvidenceStatus>[] = (
  Object.keys(proofStatusLabels) as SkillEvidenceStatus[]
).map((value) => ({
  value,
  label: proofStatusLabels[value]
}));

const evidenceStatusValues: SkillEvidenceStatus[] = ['observed', 'validated', 'refuted'];

const evidenceStatusOptions: SelectOption<SkillEvidenceStatus>[] = proofStatusOptions.filter((option) =>
  evidenceStatusValues.includes(option.value)
);

const defaultEvidenceStatus: SkillEvidenceStatus = evidenceStatusValues[0];

const normalizeEvidenceEntry = (entry: SkillEvidenceRecord): SkillEvidenceRecord => {
  const normalized: SkillEvidenceRecord = {
    status: entry.status
  };

  if (entry.initiativeId) {
    const trimmedId = entry.initiativeId.trim();
    if (trimmedId) {
      normalized.initiativeId = trimmedId;
    }
  }

  if (entry.comment) {
    const trimmedComment = entry.comment.trim();
    if (trimmedComment) {
      normalized.comment = trimmedComment;
    }
  }

  const artifacts = (entry.artifactIds ?? [])
    .map((artifact) => artifact.trim())
    .filter((artifact) => artifact.length > 0);

  if (artifacts.length > 0) {
    normalized.artifactIds = artifacts;
  }

  return normalized;
};

const normalizeSkillDraft = (skill: ExpertSkill): ExpertSkill => {
  const normalizedEvidence = (skill.evidence ?? []).map(normalizeEvidenceEntry);
  const normalizedUsage = skill.usage
    ? {
        ...skill.usage,
        from: typeof skill.usage.from === 'string' ? skill.usage.from.trim() : skill.usage.from,
        to: typeof skill.usage.to === 'string' && skill.usage.to ? skill.usage.to.trim() : skill.usage.to,
        description:
          typeof skill.usage.description === 'string' && skill.usage.description
            ? skill.usage.description.trim()
            : skill.usage.description
      }
    : undefined;

  return {
    ...skill,
    id: skill.id.trim(),
    evidence: normalizedEvidence,
    artifacts: skill.artifacts.map((artifact) => artifact.trim()).filter((artifact) => artifact.length > 0),
    usage: normalizedUsage
  };
};

const cloneSkill = (skill: ExpertSkill): ExpertSkill => ({
  ...skill,
  evidence: (skill.evidence ?? []).map((entry) => ({
    ...entry,
    artifactIds: entry.artifactIds ? [...entry.artifactIds] : undefined
  })),
  artifacts: [...skill.artifacts],
  usage: skill.usage ? { ...skill.usage } : undefined
});

const createEmptySkill = (): ExpertSkill => ({
  id: '',
  level: 'A',
  proofStatus: 'claimed',
  evidence: [],
  artifacts: [],
  interest: 'medium',
  availableFte: 0
});

const SkillEditorModal: React.FC<SkillEditorModalProps> = ({
  expert,
  isOpen,
  onClose,
  onSave
}) => {
  const [draftSkills, setDraftSkills] = useState<ExpertSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDraftSkills([]);
      setError(null);
      setIsSubmitting(false);
      return;
    }
    setDraftSkills(expert.skills.map(cloneSkill));
    setError(null);
    setIsSubmitting(false);
  }, [expert, isOpen]);

  const initiativeOptions = useMemo(
    () =>
      [
        {
          value: '',
          label: 'Не выбрана'
        },
        ...initiatives.map<SelectOption<string>>((initiative) => ({
          value: initiative.id,
          label: initiative.name
        }))
      ],
    []
  );

  const normalizedDraft = useMemo(
    () => draftSkills.map((skill) => normalizeSkillDraft(skill)),
    [draftSkills]
  );

  const referenceSkills = useMemo(
    () => expert.skills.map((skill) => normalizeSkillDraft(skill)),
    [expert.skills]
  );

  const hasChanges = useMemo(
    () => JSON.stringify(normalizedDraft) !== JSON.stringify(referenceSkills),
    [normalizedDraft, referenceSkills]
  );

  const handleSkillChange = <Key extends keyof ExpertSkill>(
    index: number,
    key: Key,
    value: ExpertSkill[Key]
  ) => {
    setDraftSkills((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleEvidenceChange = (
    skillIndex: number,
    evidenceIndex: number,
    changes: Partial<SkillEvidenceRecord>
  ) => {
    setDraftSkills((prev) => {
      const next = [...prev];
      const skill = next[skillIndex];
      if (!skill) {
        return prev;
      }
      const evidence = [...skill.evidence];
      const current = evidence[evidenceIndex];
      if (!current) {
        return prev;
      }
      evidence[evidenceIndex] = { ...current, ...changes };
      next[skillIndex] = { ...skill, evidence };
      return next;
    });
  };

  const handleRemoveSkill = (index: number) => {
    setDraftSkills((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleRemoveEvidence = (skillIndex: number, evidenceIndex: number) => {
    setDraftSkills((prev) => {
      const next = [...prev];
      const skill = next[skillIndex];
      if (!skill) {
        return prev;
      }
      const evidence = skill.evidence.filter((_, itemIndex) => itemIndex !== evidenceIndex);
      next[skillIndex] = { ...skill, evidence };
      return next;
    });
  };

  const handleAddSkill = () => {
    setDraftSkills((prev) => [...prev, createEmptySkill()]);
  };

  const handleAddEvidence = (skillIndex: number) => {
    setDraftSkills((prev) => {
      const next = [...prev];
      const skill = next[skillIndex];
      if (!skill) {
        return prev;
      }
      const evidenceEntry: SkillEvidenceRecord = {
        status: defaultEvidenceStatus,
        initiativeId: '',
        artifactIds: [],
        comment: ''
      };
      next[skillIndex] = { ...skill, evidence: [...skill.evidence, evidenceEntry] };
      return next;
    });
  };

  const validationError = useMemo(() => {
    if (normalizedDraft.some((skill) => skill.id.length === 0)) {
      return 'Укажите идентификаторы всех навыков.';
    }
    const ids = normalizedDraft.map((skill) => skill.id.toLowerCase());
    const duplicateIndex = ids.findIndex((id, index) => ids.indexOf(id) !== index);
    if (duplicateIndex >= 0) {
      return `Навык «${normalizedDraft[duplicateIndex].id}» указан более одного раза.`;
    }
    return null;
  }, [normalizedDraft]);

  const handleSubmit = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    if (isSubmitting) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await Promise.resolve(onSave(normalizedDraft));
    } catch (submitError) {
      if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError('Не удалось сохранить изменения. Попробуйте ещё раз.');
      }
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} hasOverlay onClickOutside={onClose} onEsc={onClose}>
      <div className={styles.root}>
        <Button
          size="s"
          view="clear"
          iconLeft={IconClose}
          onlyIcon
          label="Закрыть"
          onClick={onClose}
          className={styles.closeButton}
        />
        <div className={styles.header}>
          <Text size="l" weight="bold">
            Навыки эксперта
          </Text>
          <Text size="s" view="secondary">
            {expert.fullName}
          </Text>
          <Text size="xs" view="ghost">
            Управляйте перечнем навыков, уровнями и подтверждением.
          </Text>
        </div>
        <div className={styles.skillList}>
          {draftSkills.length === 0 ? (
            <Text size="s" view="secondary">
              У эксперта пока нет навыков. Добавьте первый навык, чтобы продолжить.
            </Text>
          ) : (
            draftSkills.map((skill, index) => {
              const levelOption = skillLevelOptions.find((option) => option.value === skill.level);
              const proofOption = proofStatusOptions.find((option) => option.value === skill.proofStatus);
              const resolvedName = getSkillNameById(skill.id.trim());

              return (
                <div key={`skill-${index}`} className={styles.skillCard}>
                  <div className={styles.skillHeader}>
                    <TextField
                      size="s"
                      label="Идентификатор навыка"
                      placeholder="Например, data-governance"
                      value={skill.id}
                      onChange={(value) => handleSkillChange(index, 'id', value ?? '')}
                    />
                    {resolvedName && (
                      <Text size="xs" className={styles.skillNameHint}>
                        {resolvedName}
                      </Text>
                    )}
                  </div>
                  <div className={styles.skillMeta}>
                    <Select<SelectOption<SkillLevel>>
                      size="s"
                      label="Уровень владения"
                      items={skillLevelOptions}
                      value={levelOption ?? skillLevelOptions[0]}
                      getItemLabel={(item) => item.label}
                      getItemKey={(item) => item.value}
                      onChange={(option) => option && handleSkillChange(index, 'level', option.value)}
                    />
                    <Select<SelectOption<SkillEvidenceStatus>>
                      size="s"
                      label="Статус подтверждения"
                      items={proofStatusOptions}
                      value={proofOption ?? proofStatusOptions[0]}
                      getItemLabel={(item) => item.label}
                      getItemKey={(item) => item.value}
                      onChange={(option) => option && handleSkillChange(index, 'proofStatus', option.value)}
                    />
                  </div>
                  <div className={styles.evidenceSection}>
                    <div className={styles.evidenceHeader}>
                      <Text size="s" weight="semibold">
                        Подтверждения
                      </Text>
                      <Text size="xs" view="secondary">
                        Зафиксируйте инициативы, где навык наблюдался, подтверждён или опровергнут.
                      </Text>
                    </div>
                    {skill.evidence.length === 0 ? (
                      <Text size="xs" view="ghost" className={styles.evidenceEmpty}>
                        Подтверждения ещё не добавлены.
                      </Text>
                    ) : (
                      <div className={styles.evidenceList}>
                        {skill.evidence.map((evidence, evidenceIndex) => {
                          const statusOption =
                            evidenceStatusOptions.find((option) => option.value === evidence.status) ??
                            evidenceStatusOptions[0];
                          const initiativeValue = evidence.initiativeId ?? '';
                          const initiativeOption = initiativeOptions.find(
                            (option) => option.value === initiativeValue
                          );

                          return (
                            <div
                              key={`skill-${index}-evidence-${evidenceIndex}`}
                              className={styles.evidenceCard}
                            >
                              <div className={styles.evidenceFields}>
                                <Select<SelectOption<SkillEvidenceStatus>>
                                  size="s"
                                  label="Статус"
                                  items={evidenceStatusOptions}
                                  value={statusOption}
                                  getItemLabel={(item) => item.label}
                                  getItemKey={(item) => item.value}
                                  onChange={(option) =>
                                    handleEvidenceChange(index, evidenceIndex, {
                                      status: option?.value ?? defaultEvidenceStatus
                                    })
                                  }
                                />
                                <Select<SelectOption<string>>
                                  size="s"
                                  label="Инициатива"
                                  items={initiativeOptions}
                                  value={initiativeOption ?? initiativeOptions[0]}
                                  getItemLabel={(item) => item.label}
                                  getItemKey={(item) => item.value}
                                  onChange={(option) =>
                                    handleEvidenceChange(index, evidenceIndex, {
                                      initiativeId: option?.value ?? ''
                                    })
                                  }
                                />
                                <TextField
                                  size="s"
                                  label="Артефакты (ID через запятую)"
                                  placeholder="Например, artifact-123, artifact-456"
                                  value={(evidence.artifactIds ?? []).join(', ')}
                                  onChange={(value) =>
                                    handleEvidenceChange(index, evidenceIndex, {
                                      artifactIds: value
                                        ? value
                                            .split(/[\n,]/)
                                            .map((item) => item.trim())
                                            .filter((item) => item.length > 0)
                                        : []
                                    })
                                  }
                                />
                                <TextField
                                  size="s"
                                  label="Комментарий"
                                  placeholder="Короткое описание подтверждения"
                                  value={evidence.comment ?? ''}
                                  onChange={(value) =>
                                    handleEvidenceChange(index, evidenceIndex, {
                                      comment: value ?? ''
                                    })
                                  }
                                />
                              </div>
                              <div className={styles.evidenceActions}>
                                <Button
                                  size="xs"
                                  view="ghost"
                                  label="Очистить инициативу"
                                  onClick={() =>
                                    handleEvidenceChange(index, evidenceIndex, { initiativeId: '' })
                                  }
                                  disabled={isSubmitting}
                                />
                                <Button
                                  size="xs"
                                  view="ghost"
                                  label="Удалить подтверждение"
                                  onClick={() => handleRemoveEvidence(index, evidenceIndex)}
                                  disabled={isSubmitting}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button
                      size="xs"
                      view="secondary"
                      label="Добавить подтверждение"
                      onClick={() => handleAddEvidence(index)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.skillActions}>
                    <Button
                      size="xs"
                      view="ghost"
                      label="Удалить навык"
                      onClick={() => handleRemoveSkill(index)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
        <Button
          size="s"
          view="secondary"
          label="Добавить навык"
          className={styles.addButton}
          onClick={handleAddSkill}
          disabled={isSubmitting}
        />
        <div className={styles.footer}>
          <div>
            {(error ?? validationError) && (
              <Text size="s" view="alert" className={styles.error}>
                {error ?? validationError}
              </Text>
            )}
            {!hasChanges && !error && !validationError && (
              <Text size="xs" view="secondary">
                Изменений не обнаружено.
              </Text>
            )}
          </div>
          <div className={styles.actionsGroup}>
            <Button
              size="s"
              view="ghost"
              label="Отменить"
              onClick={onClose}
              disabled={isSubmitting}
            />
            <Button
              size="s"
              view="primary"
              label="Сохранить"
              onClick={handleSubmit}
              disabled={isSubmitting || (!hasChanges && !validationError)}
              loading={isSubmitting}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SkillEditorModal;
