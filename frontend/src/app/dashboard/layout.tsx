'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    LayoutDashboard,
    Users,
    Activity,
    FlaskConical,
    Settings,
    User,
    Building2,
    LogOut,
    Bell,
    ChevronDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [isLoading, user, router]);

    const menuItems = [
        { title: "Dashboard", url: "/dashboard", roles: ["ADMIN", "CLINIC_USER"], icon: LayoutDashboard },
        { title: "Clinics", url: "/dashboard/clinics", roles: ["ADMIN"], icon: Building2 },
        { title: "Patients", url: "/dashboard/patients", roles: ["ADMIN", "CLINIC_USER"], icon: Users },
        { title: "Workflows", url: "/dashboard/workflows", roles: ["ADMIN", "CLINIC_USER"], icon: Activity },
        { title: "Lab Results", url: "/dashboard/lab-results", roles: ["ADMIN", "CLINIC_USER"], icon: FlaskConical },
        { title: "Settings", url: "/dashboard/settings", roles: ["ADMIN"], icon: Settings },
        { title: "My Profile", url: "/dashboard/profile", roles: ["CLINIC_USER"], icon: User },
    ];

    const filteredItems = menuItems.filter(item => item.roles.includes(user?.role || ''));

    const isNavActive = (url: string) =>
        url === '/dashboard' ? pathname === url : pathname === url || pathname.startsWith(url + '/');

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-[#080e1e]">
                <div className="flex items-center gap-3 p-4 rounded-3xl bg-white shadow-md border border-[#e4dec3]">
                    <div className="w-6 h-6 rounded-full border-2 border-[#080e1e] border-t-transparent animate-spin" />
                    <span className="text-xs font-bold tracking-wide text-[#080e1e]">
                        Loading Frigo Flow Portal...
                    </span>
                </div>
            </div>
        );
    }
    if (!user) return null;

    return (
        <div className="min-h-screen w-full bg-slate-50 text-[#080e1e] font-sans selection:bg-[#cbb28d]/30 selection:text-[#080e1e] pb-12">
            {/* Top Floating Navbar (Luxury Off-White & Royal Navy) */}
            <header className="sticky top-0 z-40 w-full pt-4 px-4 sm:px-8 max-w-7xl mx-auto">
                <div className="bg-white rounded-full px-5 py-2.5 shadow-[0_4px_25px_rgba(8,14,30,0.06)] border border-[#e4dec3]/80 flex items-center justify-between gap-4">
                    
                    {/* Left Brand Logo */}
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="flex items-center group mix-blend-multiply">
                            <img src="/logo.jpg" alt="Frigo Flow" className="h-[72px] w-auto origin-left scale-[1.3] ml-2 transition-transform group-hover:scale-105" />
                        </Link>
                    </div>

                    {/* Center Floating Pill Menu */}
                    <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
                        {filteredItems.map((item) => {
                            const active = isNavActive(item.url);
                            return (
                                <Link
                                    key={item.title}
                                    href={item.url}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap",
                                        active
                                            ? "bg-[#080e1e] text-[#f7f3e8] shadow-sm"
                                            : "text-slate-700 hover:text-[#080e1e] hover:bg-[#e4dec3]/60"
                                    )}
                                >
                                    {item.title}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right User Actions & Avatar */}
                    <div className="flex items-center gap-2 sm:gap-3">

                        {/* Settings Button */}
                        <button
                            onClick={() => router.push(user?.role === 'ADMIN' ? '/dashboard/settings' : '/dashboard/profile')}
                            className="w-9 h-9 rounded-full bg-[#e4dec3]/40 hover:bg-[#e4dec3]/70 text-[#080e1e] flex items-center justify-center transition-colors border border-[#ded8c4]/50"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {/* User Dropdown Profile Pill */}
                        <DropdownMenu>
                            <DropdownMenuTrigger className="flex items-center gap-2 bg-[#e4dec3]/40 hover:bg-[#e4dec3]/70 p-1 pr-3 rounded-full transition-colors outline-none border border-[#ded8c4]/50">
                                <div className="w-7 h-7 rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-xs flex items-center justify-center border border-[#cbb28d]/30">
                                    {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-bold text-[#080e1e] max-w-[100px] truncate hidden sm:inline-block">
                                    {user?.name?.split(' ')[0] || user?.email?.split('@')[0]}
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={16} className="z-[100] w-56 bg-white rounded-2xl p-2 shadow-xl border border-[#e4dec3] mt-3">
                                <div className="p-2 border-b border-[#e6e0ce]">
                                    <p className="text-xs font-bold text-[#080e1e]">{user?.name || user?.email}</p>
                                    <p className="text-[10px] text-[#8c7657] font-bold uppercase">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <DropdownMenuItem className="text-xs font-bold rounded-xl gap-2 cursor-pointer mt-1 text-[#080e1e] focus:bg-slate-100 focus:text-[#080e1e]" onClick={() => router.push('/dashboard')}>
                                    <LayoutDashboard className="w-3.5 h-3.5 text-[#cbb28d]" /> Dashboard
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs font-bold rounded-xl gap-2 cursor-pointer text-[#080e1e] focus:bg-slate-100 focus:text-[#080e1e]" onClick={() => router.push(user?.role === 'ADMIN' ? '/dashboard/settings' : '/dashboard/profile')}>
                                    <Settings className="w-3.5 h-3.5 text-[#cbb28d]" /> Account Settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[#e6e0ce]" />
                                <DropdownMenuItem
                                    className="text-xs font-bold text-rose-700 focus:bg-rose-50 focus:text-rose-800 rounded-xl gap-2 cursor-pointer"
                                    onClick={() => {
                                        logout();
                                        router.push('/login');
                                    }}
                                >
                                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Mobile Floating Menu Pills */}
                <div className="flex md:hidden items-center gap-1 bg-white p-1.5 rounded-2xl border border-[#e4dec3] mt-2 overflow-x-auto shadow-sm">
                    {filteredItems.map((item) => {
                        const active = isNavActive(item.url);
                        return (
                            <Link
                                key={item.title}
                                href={item.url}
                                className={cn(
                                    "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 shrink-0",
                                    active
                                        ? "bg-[#080e1e] text-[#f7f3e8]"
                                        : "text-slate-700 hover:text-[#080e1e] hover:bg-slate-100"
                                )}
                            >
                                {item.title}
                            </Link>
                        );
                    })}
                </div>
            </header>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8">
                {children}
            </main>
        </div>
    );
}
