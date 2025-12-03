import React, { useState } from 'react';
import { Button } from '@consta/uikit/Button';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { Card } from '@consta/uikit/Card';
import { Theme, presetGpnDefault } from '@consta/uikit/Theme';
import { useAuth } from '../context/AuthContext';
import styles from './Login.module.css';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const response = await fetch('http://localhost:3003/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    throw new Error(data.message || 'Ошибка входа');
                } else {
                    throw new Error('Сервер недоступен. Проверьте, что backend запущен на порту 3003.');
                }
            }

            const userData = await response.json();
            login(userData);
        } catch (err) {
            if (err instanceof TypeError && err.message.includes('fetch')) {
                setError('Не удалось подключиться к серверу. Убедитесь, что backend запущен.');
            } else {
                setError(err instanceof Error ? err.message : 'Произошла ошибка');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Theme preset={presetGpnDefault}>
            <div className={styles.container}>
                <Card verticalSpace="2xl" horizontalSpace="2xl" className={styles.card}>
                    <div className={styles.header}>
                        <Text size="3xl" weight="bold" align="center" className={styles.title}>
                            Nedra.Expert Node
                        </Text>
                        <Text size="m" view="secondary" align="center" className={styles.subtitle}>
                            Платформа управления экспертными узлами
                        </Text>
                    </div>
                    <form onSubmit={handleSubmit} className={styles.form}>
                        <TextField
                            label="Имя пользователя"
                            value={username}
                            onChange={(val) => setUsername(val ?? '')}
                            size="l"
                            className={styles.fullWidth}
                        />
                        <TextField
                            label="Пароль"
                            value={password}
                            onChange={(val) => setPassword(val ?? '')}
                            type="password"
                            size="l"
                            className={styles.fullWidth}
                        />
                        {error && (
                            <Text view="alert" size="s" className={styles.error}>
                                {error}
                            </Text>
                        )}
                        <Button
                            label="Войти"
                            type="submit"
                            size="l"
                            loading={loading}
                            view="primary"
                            className={styles.fullWidth}
                        />
                    </form>
                    <Text size="xs" view="ghost" align="center" className={styles.footer}>
                        Используйте учетные данные для доступа к системе
                    </Text>
                </Card>
            </div>
        </Theme>
    );
};

export default Login;
