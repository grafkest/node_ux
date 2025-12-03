import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export type UserRole = 'admin' | 'user';

export interface User {
    id: string;
    username: string;
    password: string; // In a real app, this should be hashed!
    role: UserRole;
}

// Initial seed with default admin
const defaultUsers: User[] = [
    {
        id: '1',
        username: 'admin',
        password: 'admin',
        role: 'admin'
    }
];

let users: User[] = [];

function loadUsers() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf-8');
            users = JSON.parse(data);
        } else {
            users = [...defaultUsers];
            saveUsers();
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        users = [...defaultUsers];
    }
}

function saveUsers() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save users:', error);
    }
}

// Load users on startup
loadUsers();

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
    saveUsers();
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
    saveUsers();
    return updatedUser;
}

export function deleteUser(id: string): void {
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
        throw new Error('User not found');
    }
    users.splice(userIndex, 1);
    saveUsers();
}
