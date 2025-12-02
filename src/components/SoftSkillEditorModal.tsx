import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconClose } from '@consta/icons/IconClose';
import React, { useEffect, useMemo, useState } from 'react';
import type { ExpertProfile } from '../data';
import styles from './SoftSkillEditorModal.module.css';

type SoftSkillEditorModalProps = {
  expert: ExpertProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (softSkills: string[]) => void | Promise<void>;
};

const SoftSkillEditorModal: React.FC<SoftSkillEditorModalProps> = ({
  expert,
  isOpen,
  onClose,
  onSave
}) => {
  const [draftSoftSkills, setDraftSoftSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDraftSoftSkills([]);
      setNewSkill('');
      setError(null);
      setIsSubmitting(false);
      return;
    }

    const currentSoftSkills = Array.isArray(expert.softSkills)
      ? expert.softSkills
      : [];

    setDraftSoftSkills(currentSoftSkills.map((skill) => skill));
    setNewSkill('');
    setError(null);
    setIsSubmitting(false);
  }, [expert, isOpen]);

  const normalizedSoftSkills = useMemo(
    () => draftSoftSkills.map((skill) => skill.trim()),
    [draftSoftSkills]
  );

  const validationError = useMemo(() => {
    if (normalizedSoftSkills.some((skill) => skill.length === 0)) {
      return 'Удалите пустые значения или заполните их.';
    }

    const lowered = normalizedSoftSkills.map((skill) => skill.toLowerCase());
    const duplicateIndex = lowered.findIndex(
      (value, index) => lowered.indexOf(value) !== index
    );
    if (duplicateIndex >= 0) {
      return `Soft skill «${normalizedSoftSkills[duplicateIndex]}» указан более одного раза.`;
    }

    return null;
  }, [normalizedSoftSkills]);

  const hasChanges = useMemo(() => {
    const currentSoftSkills = Array.isArray(expert.softSkills)
      ? expert.softSkills
      : [];
    const current = currentSoftSkills.map((skill) => skill.trim());
    if (normalizedSoftSkills.length !== current.length) {
      return true;
    }
    return normalizedSoftSkills.some((skill, index) => skill !== current[index]);
  }, [expert.softSkills, normalizedSoftSkills]);

  const handleSkillChange = (index: number, value: string) => {
    setDraftSoftSkills((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setError(null);
  };

  const handleRemoveSkill = (index: number) => {
    setDraftSoftSkills((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setError(null);
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (!trimmed) {
      return;
    }
    if (
      normalizedSoftSkills.some(
        (skill) => skill.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setError(`Soft skill «${trimmed}» уже добавлен.`);
      return;
    }
    setDraftSoftSkills((prev) => [...prev, trimmed]);
    setNewSkill('');
    setError(null);
  };

  const handleSubmit = async () => {
    const issues = error ?? validationError;
    if (issues) {
      setError(issues);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.resolve(onSave(normalizedSoftSkills));
    } catch (saveError) {
      if (saveError instanceof Error) {
        setError(saveError.message);
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
            Soft skills
          </Text>
          <Text size="s" view="secondary">
            {expert.fullName}
          </Text>
          <Text size="xs" view="ghost">
            Укажите ключевые soft skills эксперта без привязки к уровням.
          </Text>
        </div>
        <div className={styles.skillList}>
          {draftSoftSkills.length === 0 ? (
            <Text size="s" view="secondary" className={styles.empty}>
              У эксперта пока нет soft skills. Добавьте первый навык, чтобы продолжить.
            </Text>
          ) : (
            draftSoftSkills.map((skill, index) => (
              <div key={`soft-${index}`} className={styles.skillRow}>
                <TextField
                  size="s"
                  value={skill}
                  onChange={(value) => handleSkillChange(index, value ?? '')}
                  className={styles.skillInput}
                  placeholder="Например, фасилитация воркшопов"
                />
                <Button
                  size="xs"
                  view="ghost"
                  label="Удалить"
                  onClick={() => handleRemoveSkill(index)}
                  disabled={isSubmitting}
                />
              </div>
            ))
          )}
        </div>
        <div className={styles.newSkillRow}>
          <TextField
            size="s"
            value={newSkill}
            onChange={(value) => {
              setNewSkill(value ?? '');
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddSkill();
              }
            }}
            placeholder="Добавить soft skill"
            className={styles.skillInput}
            disabled={isSubmitting}
          />
          <Button
            size="s"
            label="Добавить"
            onClick={handleAddSkill}
            disabled={isSubmitting || newSkill.trim().length === 0}
          />
        </div>
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
          <div className={styles.actions}>
            <Button
              size="s"
              view="ghost"
              label="Отмена"
              onClick={onClose}
              disabled={isSubmitting}
            />
            <Button
              size="s"
              view="primary"
              label="Сохранить"
              onClick={handleSubmit}
              disabled={isSubmitting || !hasChanges || Boolean(validationError)}
              loading={isSubmitting}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SoftSkillEditorModal;
