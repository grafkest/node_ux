import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  persistTokens,
  readJsonSafe,
  restoreTokens,
  type AuthTokens
} from '../services/apiClient';

export type UserRole = 'admin' | 'user';

export interface User {
    id: string;
    username: string;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    tokens: AuthTokens | null;
    login: (params: { username: string; password: string }) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [tokens, setTokens] = useState<AuthTokens | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('auth_user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error('Failed to parse stored user', e);
                localStorage.removeItem('auth_user');
            }
        }

        const restoredTokens = restoreTokens();
        if (restoredTokens) {
            setTokens(restoredTokens);
        }
    }, []);

    const login = async ({ username, password }: { username: string; password: string }) => {
        const response = await apiFetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            skipAuth: true
        });

        if (!response.ok) {
            const error = await readJsonSafe<{ message?: string }>(response);
            throw new Error(error?.message ?? 'Ошибка входа');
        }

        const payload = await response.json();
        const authTokens = {
            accessToken: payload.accessToken as string,
            refreshToken: payload.refreshToken as string | undefined
        } satisfies AuthTokens;

        setUser(payload.user as User);
        setTokens(authTokens);
        persistTokens(authTokens);
        localStorage.setItem('auth_user', JSON.stringify(payload.user));
    };

    const logout = () => {
        setUser(null);
        setTokens(null);
        localStorage.removeItem('auth_user');
        persistTokens(null);
        if (typeof window !== 'undefined') {
            window.location.replace('/login');
        }
    };

    const value = useMemo(
        () => ({
            user,
            tokens,
            login,
            logout,
            isAuthenticated: !!user && !!tokens?.accessToken
        }),
        [login, logout, tokens, user]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
