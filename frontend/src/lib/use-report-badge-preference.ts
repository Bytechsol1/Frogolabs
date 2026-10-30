'use client';

import { useCallback, useSyncExternalStore } from 'react';

const preferenceEvent = 'frigoflow:report-badge-changed';
const storageKey = (userId: string) => `frigoflow:report-badge:${userId}`;
const serverSnapshot = () => true;

export function useReportBadgePreference(userId?: string) {
    const getSnapshot = useCallback(() => {
        if (!userId) return true;
        try { return localStorage.getItem(storageKey(userId)) !== 'off'; }
        catch { return true; }
    }, [userId]);

    const subscribe = useCallback((onChange: () => void) => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || (userId && event.key === storageKey(userId))) onChange();
        };
        const onPreference = (event: Event) => {
            if (event instanceof CustomEvent && event.detail === userId) onChange();
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener(preferenceEvent, onPreference);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(preferenceEvent, onPreference);
        };
    }, [userId]);

    const enabled = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
    const setEnabled = useCallback((value: boolean) => {
        if (!userId) return false;
        try {
            localStorage.setItem(storageKey(userId), value ? 'on' : 'off');
            window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: userId }));
            return true;
        } catch { return false; }
    }, [userId]);

    return [enabled, setEnabled] as const;
}
