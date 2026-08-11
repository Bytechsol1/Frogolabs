'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function RootPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/login';
      }
    }
  }, [user, isLoading, router]);

  return null;
}
