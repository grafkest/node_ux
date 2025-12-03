import { randomUUID } from 'node:crypto';

export type UserRole = 'admin' | 'user';

export interface User {
    id: string;
    username: string;
    password: string; // In a real app, this should be hashed!
    role: UserRole;
}

// Initial seed with default admin
const users: User[] = [
    {
        id: '1',
        username: 'admin',
        password: 'admin',
        role: 'admin'
    }
];

export function findUser(username: string): User | undefined {
    return users.find((u) => u.username === username);
}

export function createUser(username: string, password: string, role: UserRole): User {
    if (findUser(username)) {
        throw new Error('User already exists');
    }

    const newUser: User = {
        id: randomUUID(),
        username,
        password,
        role
    };

    users.push(newUser);
    return newUser;
}

export function listUsers(): Omit<User, 'password'>[] {
    return users.map(({ id, username, role }) => ({ id, username, role }));
}

export function updateUser(id: string, updates: Partial<Omit<User, 'id'>>): User {
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
        throw new Error('User not found');
    }

    const updatedUser = { ...users[userIndex], ...updates };
    users[userIndex] = updatedUser;
    return updatedUser;
}

export function deleteUser(id: string): void {
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
        throw new Error('User not found');
    }
    users.splice(userIndex, 1);
}
