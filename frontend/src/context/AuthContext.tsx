/**
 * AuthContext.tsx — Estado Global de Autenticação (React Context)
 *
 * Provê para toda a aplicação:
 * - user: dados do usuario logado (id, name, email, role)
 * - token: JWT armazenado no localStorage
 * - login(): salva token + user no state e localStorage
 * - logout(): limpa tudo (state + localStorage)
 * - isLoading: true enquanto valida o token armazenado via GET /api/auth/me
 *
 * Persistência: Token sobrevive ao refresh da página via localStorage
 */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';

// types
export interface User {
    id: string;
    username?: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'TEACHER' | 'STUDENT';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    login: () => { },
    logout: () => { },
    isLoading: true
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasCheckedRef = useRef(false);

    useEffect(() => {
        if (hasCheckedRef.current) return;
        hasCheckedRef.current = true;

        const storedToken = localStorage.getItem('eduvault_token');
        if (storedToken) {
            api.get('/api/auth/me', {
                headers: { Authorization: `Bearer ${storedToken}` }
            }).then(response => {
                setUser(response.data);
                setToken(storedToken);
            }).catch(() => {
                localStorage.removeItem('eduvault_token');
            }).finally(() => {
                setIsLoading(false);
            });
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem('eduvault_token', newToken);
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem('eduvault_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
