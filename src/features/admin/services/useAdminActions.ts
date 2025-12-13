import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { apiFetch } from '../../../services/apiClient';
import type { AdminUser, UserDraftPayload } from '../types';

type AdminNoticeHandler = (type: 'success' | 'error', message: string) => void;

export function useAdminActions(showAdminNotice: AdminNoticeHandler) {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);

  const fetchUsers = useCallback(() => {
    if (!user || user.role !== 'admin') return;
    apiFetch('/api/users')
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error('Failed to fetch users', err));
  }, [user]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = useCallback(
    (draft: UserDraftPayload) => {
      if (!user || user.role !== 'admin') return;
      apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to create user');
          return res.json();
        })
        .then(() => {
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно создан');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось создать пользователя');
        });
    },
    [fetchUsers, showAdminNotice, user]
  );

  const handleUpdateUser = useCallback(
    (id: string, draft: UserDraftPayload) => {
      if (!user || user.role !== 'admin') return;
      apiFetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to update user');
          return res.json();
        })
        .then(() => {
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно обновлен');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось обновить пользователя');
        });
    },
    [fetchUsers, showAdminNotice, user]
  );

  const handleDeleteUser = useCallback(
    (id: string) => {
      if (!user || user.role !== 'admin') return;
      apiFetch(`/api/users/${id}`, {
        method: 'DELETE'
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to delete user');
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно удален');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось удалить пользователя');
        });
    },
    [fetchUsers, showAdminNotice, user]
  );

  return {
    users,
    currentUser: user ?? null,
    onCreateUser: handleCreateUser,
    onUpdateUser: handleUpdateUser,
    onDeleteUser: handleDeleteUser,
  };
}

export type UseAdminActionsResult = ReturnType<typeof useAdminActions>;
