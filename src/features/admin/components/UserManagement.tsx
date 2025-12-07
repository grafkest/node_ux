import { Button } from '@consta/uikit/Button';
import { Select } from '@consta/uikit/Select';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconEdit } from '@consta/icons/IconEdit';
import { IconTrash } from '@consta/icons/IconTrash';
import React from 'react';
import type { AdminUser, UserDraftPayload } from '../types';
import styles from './AdminPanel.module.css';

type SelectItem<Value extends string> = {
    label: string;
    value: Value;
};

type UserManagementProps = {
    users: AdminUser[];
    selectedUserId: string;
    userDraft: UserDraftPayload;
    onUserDraftChange: (draft: UserDraftPayload) => void;
    onSubmit: () => void;
    onEdit: (userId: string) => void;
    onDelete: (userId: string) => void;
    currentUser: AdminUser | null;
};

const UserManagement: React.FC<UserManagementProps> = ({
    users,
    selectedUserId,
    userDraft,
    onUserDraftChange,
    onSubmit,
    onEdit,
    onDelete,
    currentUser
}) => {
    return (
        <div className={styles.formWrapper}>
            <div className={styles.formHeader}>
                <div>
                    <Text size="l" weight="semibold" className={styles.formTitle}>
                        {selectedUserId === '__new__' ? 'Создание пользователя' : 'Редактирование пользователя'}
                    </Text>
                    <Text size="xs" view="secondary" className={styles.formSubtitle}>
                        Управление учетными записями системы
                    </Text>
                </div>
            </div>
            <div className={styles.formBody}>
                <label className={styles.field}>
                    <Text size="xs" weight="semibold" className={styles.label}>
                        Имя пользователя
                    </Text>
                    <TextField
                        size="s"
                        value={userDraft.username}
                        onChange={(value) => onUserDraftChange({ ...userDraft, username: value ?? '' })}
                        disabled={selectedUserId !== '__new__'}
                    />
                </label>
                <label className={styles.field}>
                    <Text size="xs" weight="semibold" className={styles.label}>
                        {selectedUserId === '__new__' ? 'Пароль' : 'Новый пароль (оставьте пустым, чтобы не менять)'}
                    </Text>
                    <TextField
                        size="s"
                        type="password"
                        value={userDraft.password ?? ''}
                        onChange={(value) => onUserDraftChange({ ...userDraft, password: value ?? '' })}
                        placeholder={selectedUserId !== '__new__' ? '••••••' : undefined}
                    />
                </label>
                <label className={styles.field}>
                    <Text size="xs" weight="semibold" className={styles.label}>
                        Роль
                    </Text>
                    <Select<SelectItem<'admin' | 'user'>>
                        size="s"
                        items={[
                            { label: 'Администратор', value: 'admin' },
                            { label: 'Пользователь', value: 'user' }
                        ]}
                        value={
                            userDraft.role === 'admin'
                                ? { label: 'Администратор', value: 'admin' }
                                : { label: 'Пользователь', value: 'user' }
                        }
                        getItemLabel={(item) => item.label}
                        getItemKey={(item) => item.value}
                        onChange={(item) => item && onUserDraftChange({ ...userDraft, role: item.value })}
                    />
                </label>
                <div className={styles.formActions}>
                    <Button
                        size="m"
                        view="primary"
                        label={selectedUserId === '__new__' ? 'Создать пользователя' : 'Сохранить изменения'}
                        onClick={onSubmit}
                    />
                </div>
            </div>

            {/* User List */}
            <div className={styles.formBody} style={{ marginTop: '32px' }}>
                <Text size="l" weight="semibold" className={styles.formTitle} style={{ marginBottom: '16px' }}>
                    Список пользователей
                </Text>
                {users.length > 0 ? (
                    <div className={styles.userList}>
                        {users.map((user) => (
                            <div key={user.id} className={styles.userCard}>
                                <div className={styles.userCardContent}>
                                    <div>
                                        <Text size="m" weight="semibold">
                                            {user.username}
                                        </Text>
                                        <Text size="xs" view="secondary">
                                            {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
                                        </Text>
                                    </div>
                                    <div className={styles.userCardActions}>
                                        <Button
                                            size="xs"
                                            view="clear"
                                            iconLeft={IconEdit}
                                            onClick={() => onEdit(user.id)}
                                        />
                                        <Button
                                            size="xs"
                                            view="clear"
                                            iconLeft={IconTrash}
                                            onClick={() => onDelete(user.id)}
                                            disabled={currentUser != null && user.id === currentUser.id}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Text size="s" view="secondary">
                        Пользователей пока нет
                    </Text>
                )}
            </div>
        </div>
    );
};

export default UserManagement;
