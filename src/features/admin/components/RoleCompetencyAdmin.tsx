import { Button } from '@consta/uikit/Button';
import { Combobox } from '@consta/uikit/Combobox';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import React, { useEffect, useMemo, useState } from 'react';
import type { TeamRole } from '../../../data';
import {
  deleteRole,
  getKnownRoles,
  getSkillsByRole,
  registerRole,
  registerAdHocSkill,
  renameRole,
  setRoleSkills,
  skills
} from '../../../data/skills';
import { useSkillRegistryVersion } from '../../../utils/useSkillRegistryVersion';
import styles from './AdminPanel.module.css';

const RoleCompetencyAdmin: React.FC = () => {
  const registryVersion = useSkillRegistryVersion();
  const roles = useMemo(() => {
    void registryVersion;
    return getKnownRoles();
  }, [registryVersion]);
  const [selectedRole, setSelectedRole] = useState<TeamRole | null>(() => roles[0] ?? null);
  const [newRoleName, setNewRoleName] = useState('');
  const [roleNameDraft, setRoleNameDraft] = useState('');
  const [hardSelection, setHardSelection] = useState<string[]>([]);
  const [softSelection, setSoftSelection] = useState<string[]>([]);
  const [newHardSkillName, setNewHardSkillName] = useState('');
  const [newSoftSkillName, setNewSoftSkillName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sortedSkills = useMemo(() => {
    void registryVersion;
    return Object.values(skills).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [registryVersion]);

  const hardSkillIds = useMemo(
    () => sortedSkills.filter((skill) => skill.category === 'hard').map((skill) => skill.id),
    [sortedSkills]
  );
  const softSkillIds = useMemo(
    () => sortedSkills.filter((skill) => skill.category === 'soft').map((skill) => skill.id),
    [sortedSkills]
  );
  const skillLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    sortedSkills.forEach((skill) => map.set(skill.id, skill.name));
    return map;
  }, [sortedSkills]);

  useEffect(() => {
    if (!selectedRole || roles.length === 0) {
      setSelectedRole(roles[0] ?? null);
      return;
    }
    if (!roles.includes(selectedRole)) {
      setSelectedRole(roles[0] ?? null);
    }
  }, [roles, selectedRole]);

  useEffect(() => {
    if (!selectedRole) {
      setRoleNameDraft('');
      setHardSelection([]);
      setSoftSelection([]);
      return;
    }
    setRoleNameDraft(selectedRole);
    const roleSkills = getSkillsByRole(selectedRole as TeamRole);
    setHardSelection(roleSkills.filter((skill) => skill.category === 'hard').map((skill) => skill.id));
    setSoftSelection(roleSkills.filter((skill) => skill.category === 'soft').map((skill) => skill.id));
  }, [selectedRole, registryVersion]);

  const handleCreateRole = () => {
    const created = registerRole(newRoleName);
    if (!created) {
      setStatusMessage('Введите название роли, чтобы добавить её.');
      return;
    }
    setSelectedRole(created);
    setNewRoleName('');
    setStatusMessage('Новая роль создана. Настройте компетенции и сохраните изменения.');
  };

  const handleRenameRole = () => {
    if (!selectedRole) {
      return;
    }
    const normalized = roleNameDraft.trim();
    if (!normalized) {
      setStatusMessage('Название роли не может быть пустым.');
      return;
    }
    renameRole(selectedRole, normalized);
    setSelectedRole(normalized as TeamRole);
    setStatusMessage('Название роли обновлено.');
  };

  const handleAddSkill = (category: 'hard' | 'soft') => {
    if (!selectedRole) {
      setStatusMessage('Сначала выберите или создайте роль.');
      return;
    }

    const value = category === 'hard' ? newHardSkillName : newSoftSkillName;
    const definition = registerAdHocSkill(value, category, [selectedRole]);

    if (!definition) {
      setStatusMessage('Введите название навыка, чтобы добавить его.');
      return;
    }

    if (category === 'hard') {
      setHardSelection((prev) => Array.from(new Set([...prev, definition.id])));
      setNewHardSkillName('');
    } else {
      setSoftSelection((prev) => Array.from(new Set([...prev, definition.id])));
      setNewSoftSkillName('');
    }

    setStatusMessage(`Навык «${definition.name}» добавлен для роли ${selectedRole}.`);
  };

  const handleSaveSkills = () => {
    if (!selectedRole) {
      return;
    }
    const mergedSkills = Array.from(new Set([...hardSelection, ...softSelection]));
    setRoleSkills(selectedRole, mergedSkills);
    setStatusMessage('Набор компетенций сохранён.');
  };

  const handleDeleteRole = () => {
    if (!selectedRole) {
      return;
    }
    deleteRole(selectedRole);
    setSelectedRole(null);
    setStatusMessage('Роль удалена. Выберите другую роль или создайте новую.');
  };

  const hardSelectionValue = hardSelection.filter((id) => hardSkillIds.includes(id));
  const softSelectionValue = softSelection.filter((id) => softSkillIds.includes(id));

  return (
    <div className={styles.roleManager}>
      <div>
        <Text size="l" weight="semibold" className={styles.formTitle}>
          Управление ролями и компетенциями
        </Text>
        <Text size="s" view="secondary" className={styles.formSubtitle}>
          Редактируйте названия ролей и настраивайте их ключевые hard и soft skills.
        </Text>
      </div>

      <div className={styles.roleRow}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Текущая роль
          </Text>
          <Combobox<string>
            size="s"
            items={roles}
            value={selectedRole}
            getItemKey={(item) => item}
            getItemLabel={(item) => item || '—'}
            placeholder={roles.length === 0 ? 'Создайте новую роль' : 'Выберите роль'}
            onChange={(value) => setSelectedRole(value)}
          />
        </label>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Создать новую роль
          </Text>
          <div className={styles.inlineForm}>
            <input
              className={styles.input}
              value={newRoleName}
              placeholder="Название роли"
              onChange={(event) => setNewRoleName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleCreateRole();
                }
              }}
            />
            <Button size="s" view="primary" label="Добавить" onClick={handleCreateRole} />
          </div>
        </label>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.field}>
          <Text size="xs" weight="semibold" className={styles.label}>
            Название роли
          </Text>
          <TextField
            size="s"
            placeholder="Введите название"
            disabled={!selectedRole}
            value={roleNameDraft}
            onChange={(value) => setRoleNameDraft(value ?? '')}
          />
        </label>
        <div className={styles.roleActions}>
          <Button
            size="s"
            view="primary"
            disabled={!selectedRole || roleNameDraft.trim().length === 0}
            label="Сохранить название"
            onClick={handleRenameRole}
          />
          <Button
            size="s"
            view="ghost"
            disabled={!selectedRole}
            label="Удалить роль"
            onClick={handleDeleteRole}
          />
        </div>
      </div>

      <div className={styles.roleGrid}>
        <div className={styles.roleCard}>
          <Text size="s" weight="semibold" className={styles.label}>
            Ключевые hard skills
          </Text>
          <Text size="xs" view="secondary" className={styles.roleHint}>
            Выберите навыки, которые считаются обязательными или базовыми для роли.
          </Text>
          <Combobox<string>
            size="s"
            multiple
            items={hardSkillIds}
            value={hardSelectionValue}
            getItemKey={(item) => item}
            getItemLabel={(item) => skillLabelMap.get(item) ?? item}
            placeholder="Добавьте hard skills"
            onChange={(value) => setHardSelection(value ?? [])}
          />
          <Text size="xs" view="secondary" className={styles.roleHint}>
            Выбрано: {hardSelectionValue.length}
          </Text>
          <div className={styles.inlineForm}>
            <TextField
              size="s"
              placeholder="Добавить новый hard skill"
              value={newHardSkillName}
              onChange={(value) => setNewHardSkillName(value ?? '')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddSkill('hard');
                }
              }}
            />
            <Button size="s" view="secondary" label="Добавить" onClick={() => handleAddSkill('hard')} />
          </div>
        </div>
        <div className={styles.roleCard}>
          <Text size="s" weight="semibold" className={styles.label}>
            Ключевые soft skills
          </Text>
          <Text size="xs" view="secondary" className={styles.roleHint}>
            Подберите универсальные навыки, которые помогут оценивать соответствие роли.
          </Text>
          <Combobox<string>
            size="s"
            multiple
            items={softSkillIds}
            value={softSelectionValue}
            getItemKey={(item) => item}
            getItemLabel={(item) => skillLabelMap.get(item) ?? item}
            placeholder="Добавьте soft skills"
            onChange={(value) => setSoftSelection(value ?? [])}
          />
          <Text size="xs" view="secondary" className={styles.roleHint}>
            Выбрано: {softSelectionValue.length}
          </Text>
          <div className={styles.inlineForm}>
            <TextField
              size="s"
              placeholder="Добавить новый soft skill"
              value={newSoftSkillName}
              onChange={(value) => setNewSoftSkillName(value ?? '')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddSkill('soft');
                }
              }}
            />
            <Button size="s" view="secondary" label="Добавить" onClick={() => handleAddSkill('soft')} />
          </div>
        </div>
      </div>

      <div className={styles.roleActions}>
        <Button
          size="s"
          view="primary"
          disabled={!selectedRole}
          label="Сохранить набор компетенций"
          onClick={handleSaveSkills}
        />
        <Text size="xs" view="secondary" className={styles.roleHint}>
          Изменения применяются ко всем формам и импортам, где используется выбранная роль.
        </Text>
      </div>

      {statusMessage && (
        <Text size="s" view="secondary" className={styles.roleStatus}>
          {statusMessage}
        </Text>
      )}
    </div>
  );
};

export default RoleCompetencyAdmin;
