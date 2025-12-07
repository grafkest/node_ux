import { Text } from '@consta/uikit/Text';
import React, { useEffect, useState } from 'react';
import styles from './AdminPanel.module.css';

type LogEntry = {
    id: string;
    userId: string;
    username: string;
    timestamp: string;
    success: boolean;
    ip?: string;
};

const LoginLogsView: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/logs')
            .then((res) => res.json())
            .then((data) => {
                setLogs(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to fetch logs', err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className={styles.formWrapper}>
                <Text size="m" view="secondary">
                    Загрузка логов...
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.formWrapper}>
            <div className={styles.formHeader}>
                <div>
                    <Text size="l" weight="semibold" className={styles.formTitle}>
                        Журнал входов
                    </Text>
                    <Text size="xs" view="secondary" className={styles.formSubtitle}>
                        История попыток входа в систему
                    </Text>
                </div>
            </div>

            <div className={styles.formBody}>
                {logs.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-bg-border)' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>
                                        <Text size="xs" weight="semibold">Время</Text>
                                    </th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>
                                        <Text size="xs" weight="semibold">Пользователь</Text>
                                    </th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>
                                        <Text size="xs" weight="semibold">Статус</Text>
                                    </th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>
                                        <Text size="xs" weight="semibold">IP адрес</Text>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--color-bg-border)' }}>
                                        <td style={{ padding: '12px' }}>
                                            <Text size="s">{new Date(log.timestamp).toLocaleString('ru-RU')}</Text>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <Text size="s">{log.username}</Text>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <Text size="s" view={log.success ? 'success' : 'alert'}>
                                                {log.success ? 'Успешно' : 'Ошибка'}
                                            </Text>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <Text size="s" view="secondary">{log.ip || '-'}</Text>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Text size="s" view="secondary">
                        Записей в журнале пока нет
                    </Text>
                )}
            </div>
        </div>
    );
};

export default LoginLogsView;
