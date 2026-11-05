'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LabReportNotifications } from "@/components/LabReportNotifications";
import { NavbarBrand, ClinicAvatar, BrandSurface, useBrandTitle } from '@/components/ClinicBrand';
import { useBranding } from '@/context/BrandingContext';
import {
    LayoutDashboard,
    Users,
    Activity,
    FlaskConical,
    Settings,
    Building2,
    LogOut,
    ChevronDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, logout, isLoading, refreshUser } = useAuth();
    const { branding } = useBranding();
    useBrandTitle(branding);
    const router = useRouter();
    const pathname = usePathname();
    const [showSandboxNotice, setShowSandboxNotice] = useState(false);

    // AuthProvider already verifies the initial session (or receives the verified
    // login profile). Recheck permissions on later navigation, without a second
    // identical request while opening the dashboard for the first time.
    const previousPath = useRef(pathname);
    useEffect(() => {
        if (previousPath.current === pathname) return;
        previousPath.current = pathname;
        void refreshUser();
    }, [pathname, refreshUser]);

    useEffect(() => {
        if (!user?.token) return;
        const controller = new AbortController();
        fetch('/api/v1/terra/ordering/config', {
            headers: { Authorization: `Bearer ${user.token}` }, signal: controller.signal,
        }).then(response => response.ok ? response.json() : null)
            .then(config => { if (!controller.signal.aborted) setShowSandboxNotice(config?.showSandboxData === true); })
            .catch(() => {});
        return () => controller.abort();
    }, [user?.token]);

    useEffect(() => {
        if (!isLoading && !user) {
            window.location.replace('/login');
        }
    }, [isLoading, user]);

    const menuItems = [
        { title: "Dashboard", url: "/dashboard", roles: ["ADMIN", "CLINIC_USER"], icon: LayoutDashboard },
        { title: "Clinics", url: "/dashboard/clinics", roles: ["ADMIN"], icon: Building2 },
        { title: "Patients", url: "/dashboard/patients", roles: ["ADMIN", "CLINIC_USER"], icon: Users },
        { title: "Sessions", url: "/dashboard/workflows", roles: ["ADMIN", "CLINIC_USER"], icon: Activity },
        { title: "Lab Results", url: "/dashboard/lab-results", roles: ["ADMIN", "CLINIC_USER"], icon: FlaskConical },
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
        <BrandSurface branding={branding} className="min-h-screen w-full bg-slate-50 text-[#080e1e] font-sans selection:bg-[#cbb28d]/30 selection:text-[#080e1e] pb-12">
            {/* Top Floating Navbar (Luxury Off-White & Royal Navy) */}
            <header className="sticky top-0 z-40 w-full pt-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="bg-white rounded-full px-3 sm:px-5 py-2.5 shadow-[0_4px_25px_rgba(8,14,30,0.06)] border border-[#e4dec3]/80 flex items-center justify-between gap-2 sm:gap-4">
                    
                    {/* Left Brand Logo */}
                    <div className="flex min-w-0 items-center gap-3">
                        <Link href="/dashboard" aria-label="Dashboard home" className="flex min-w-0 max-w-full items-center group mix-blend-multiply">
                            <NavbarBrand branding={branding} />
                        </Link>
                    </div>

                    {/* Center Floating Pill Menu */}
                    <nav aria-label="Dashboard navigation" className="hidden xl:flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
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
                    <div className="flex shrink-0 items-center gap-1 sm:gap-3">

                        <LabReportNotifications />

                        {/* Settings Button */}
                        <button
                            type="button"
                            aria-label="Settings"
                            onClick={() => router.push('/dashboard/settings')}
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-[#e4dec3]/40 hover:bg-[#e4dec3]/70 text-[#080e1e] flex items-center justify-center transition-colors border border-[#ded8c4]/50"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {/* User Dropdown Profile Pill */}
                        <DropdownMenu>
                            <DropdownMenuTrigger aria-label="Account menu" className="flex items-center gap-2 bg-[#e4dec3]/40 hover:bg-[#e4dec3]/70 p-1 sm:pr-3 rounded-full transition-colors outline-none border border-[#ded8c4]/50">
                                <div data-account-avatar className="w-7 h-7 shrink-0 overflow-hidden rounded-full bg-[#080e1e] text-[#cbb28d] font-bold text-xs flex items-center justify-center border border-[#cbb28d]/30">
                                    <ClinicAvatar branding={branding} initial={(user.name?.charAt(0) || user.email?.charAt(0) || 'U').toUpperCase()} />
                                </div>
                                <span className="text-xs font-bold text-[#080e1e] max-w-[100px] truncate hidden sm:inline-block">
                                    {user?.name?.split(' ')[0] || user?.email?.split('@')[0]}
                                </span>
                                <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-slate-500" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={16} className="z-[100] w-56 bg-white rounded-2xl p-2 shadow-xl border border-[#e4dec3] mt-3">
                                <div className="p-2 border-b border-[#e6e0ce]">
                                    <p className="text-xs font-bold text-[#080e1e]">{user?.name || user?.email}</p>
                                    <p className="text-[10px] text-[#8c7657] font-bold uppercase">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <DropdownMenuItem
                                    className="text-xs font-bold text-rose-700 focus:bg-rose-50 focus:text-rose-800 rounded-xl gap-2 cursor-pointer mt-1"
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
                <nav aria-label="Dashboard navigation" className="flex flex-wrap xl:hidden items-center gap-1 bg-white p-1.5 rounded-2xl border border-[#e4dec3] mt-2 shadow-sm">
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
                </nav>
            </header>

            {/* Main Content Area */}
            <main className="w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
                {showSandboxNotice && <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Terra sandbox: session progress and lab results shown here are simulated, not clinical results.</p>}
                {children}
            </main>
        </BrandSurface>
    );
}
