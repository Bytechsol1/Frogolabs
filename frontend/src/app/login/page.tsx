'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const DEMO_ACCOUNTS = [
    { label: 'Austin Family Clinic', email: 'emily@austinfamily.com', password: 'demo123' },
    { label: 'Green Valley Clinic', email: 'mark@greenvalley.com', password: 'demo123' },
    { label: 'Westside Health Center', email: 'sarah@westside.com', password: 'demo123' },
];

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const response = await axios.post('/api/v1/auth/login', { email, password });
            await login(response.data.access_token);
            router.push('/dashboard');
        } catch (err: any) {
            const msg = err.response?.data?.message;
            setError(typeof msg === 'string' ? msg : 'Invalid email or password');
        }
    };

    const fillDemo = (account: typeof DEMO_ACCOUNTS[0]) => {
        setEmail(account.email);
        setPassword(account.password);
        setError('');
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <div className="w-full max-w-md space-y-5">
                {/* Logo */}
                <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="bg-primary w-9 h-9 rounded-md flex items-center justify-center text-primary-foreground font-bold italic text-lg">F</div>
                        <span className="text-2xl font-extrabold text-primary">Frigo Labs</span>
                    </div>
                    <p className="text-muted-foreground text-sm">Sign in to access your dashboard</p>
                </div>

                {/* Demo Accounts */}
                <Card className="border-dashed border-primary/30 bg-primary/5 shadow-none">
                    <CardContent className="p-4 space-y-2">
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground text-center mb-3">
                            Try a Demo Clinic Account
                        </p>
                        <div className="grid gap-2">
                            {DEMO_ACCOUNTS.map(account => (
                                <button
                                    key={account.email}
                                    type="button"
                                    onClick={() => fillDemo(account)}
                                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted/50 hover:border-primary/40 transition-colors text-left group"
                                >
                                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                        {account.label}
                                    </span>
                                    <span className="text-[10px] font-black uppercase text-primary/70 tracking-wider">
                                        Use →
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-center text-muted-foreground pt-1">
                            Password for all demo accounts: <span className="font-bold font-mono">demo123</span>
                        </p>
                    </CardContent>
                </Card>

                {/* Login Form */}
                <Card className="border-none shadow-md">
                    <CardHeader className="space-y-1 text-center pb-4">
                        <CardTitle className="text-xl font-bold">Sign In</CardTitle>
                        <CardDescription>Enter your credentials to continue</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="doctor@clinic.com"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            {error && <p className="text-sm text-destructive text-center">{error}</p>}
                            <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                                Sign In
                            </Button>
                            <p className="text-center text-sm text-muted-foreground">
                                New clinic?{' '}
                                <a href="/signup" className="text-primary font-semibold hover:underline">
                                    Create an account
                                </a>
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
