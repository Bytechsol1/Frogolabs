'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Shield, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import axios from 'axios';

export default function ProfilePage() {
    const { user, login } = useAuth();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSave = async () => {
        if (!name.trim() || !email.trim()) {
            setError('Name and email are required.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await axios.patch(
                '/api/v1/auth/me',
                { name: name.trim(), email: email.trim() },
                { headers: { Authorization: `Bearer ${user?.token}` } }
            );
            await login(res.data.access_token);
            setSuccess('Profile updated successfully.');
            setEditing(false);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setName(user?.name || '');
        setEmail(user?.email || '');
        setError('');
        setEditing(false);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-primary">User Profile</h2>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Account Information</CardTitle>
                    {!editing && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => { setEditing(true); setSuccess(''); setError(''); }}
                        >
                            <Pencil className="w-4 h-4" /> Edit Profile
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Avatar row */}
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-xl">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary">
                            {(editing ? name : user?.name)?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">{user?.name || 'Guest User'}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {user?.email}
                            </p>
                        </div>
                    </div>

                    {editing ? (
                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="profile-name">Full Name</Label>
                                <Input
                                    id="profile-name"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Your full name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="profile-email">Email Address</Label>
                                <Input
                                    id="profile-email"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                />
                            </div>
                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}
                            <div className="flex gap-3 pt-2">
                                <Button onClick={handleSave} disabled={saving} className="gap-2">
                                    <Check className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                <Button variant="outline" onClick={handleCancel} disabled={saving} className="gap-2">
                                    <X className="w-4 h-4" /> Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-2 text-sm pt-2 border-t">
                            {success && (
                                <p className="text-sm text-emerald-600 font-medium pb-1">{success}</p>
                            )}
                            <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Full Name:</span>
                                <span className="font-medium">{user?.name}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Email:</span>
                                <span className="font-medium">{user?.email}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Assigned Role:</span>
                                <span className="font-bold flex items-center gap-1 text-primary">
                                    <Shield className="w-3 h-3" /> {user?.role}
                                </span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-muted-foreground">Member Since:</span>
                                <span className="font-medium">June 2026</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
