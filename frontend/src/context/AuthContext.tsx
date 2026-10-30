'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: string;
    clinic_id: string | null;
    clinic_name: string | null;
    is_clinic_admin: boolean;
    email_verified: boolean;
    token: string;
}

interface AuthContextType {
    user: AuthUser | null;
    login: (token: string) => Promise<void>;
    logout: (redirectTo?: string) => void;
    isLoading: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const profileRequest = useRef(0);

    const fetchProfile = useCallback(async (token: string, propagateError = false) => {
        const request = ++profileRequest.current;
        try {
            const res = await axios.get<Omit<AuthUser, 'token'>>('/api/v1/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (request === profileRequest.current && localStorage.getItem('access_token') === token) {
                setUser({ ...res.data, token });
            }
        } catch (err) {
            // A temporary network failure must not discard an otherwise valid session.
            if (axios.isAxiosError(err) && [401, 403].includes(err.response?.status ?? 0)
                && request === profileRequest.current && localStorage.getItem('access_token') === token) {
                localStorage.removeItem('access_token');
                setUser(null);
            }
            if (propagateError) throw err;
        } finally {
            if (request === profileRequest.current) setIsLoading(false);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        const token = localStorage.getItem('access_token');
        if (token) await fetchProfile(token);
        else {
            ++profileRequest.current;
            setUser(null);
            setIsLoading(false);
        }
    }, [fetchProfile]);

    useEffect(() => {
        let active = true;
        queueMicrotask(() => { if (active) void refreshUser(); });
        const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshUser(); };
        const refreshStorage = (event: StorageEvent) => { if (event.key === 'access_token' || event.key === null) void refreshUser(); };
        const refreshRestoredPage = (event: PageTransitionEvent) => {
            const dashboard = location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/');
            if (dashboard && !localStorage.getItem('access_token')) {
                window.location.replace('/login');
                return;
            }
            if (event.persisted) void refreshUser();
        };
        window.addEventListener('focus', refreshVisible);
        document.addEventListener('visibilitychange', refreshVisible);
        window.addEventListener('storage', refreshStorage);
        window.addEventListener('pageshow', refreshRestoredPage);
        return () => {
            active = false;
            window.removeEventListener('focus', refreshVisible);
            document.removeEventListener('visibilitychange', refreshVisible);
            window.removeEventListener('storage', refreshStorage);
            window.removeEventListener('pageshow', refreshRestoredPage);
        };
    }, [refreshUser]);

    const login = async (token: string) => {
        localStorage.setItem('access_token', token);
        await fetchProfile(token, true);
    };

    const logout = (redirectTo?: string) => {
        ++profileRequest.current;
        localStorage.removeItem('access_token');
        if (redirectTo) {
            // Leave the dashboard document before its signed-out route guard runs.
            // Back returns through the signed-out dashboard guard, which replaces it with login.
            window.location.assign(redirectTo);
            return;
        }
        setUser(null);
        setIsLoading(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
