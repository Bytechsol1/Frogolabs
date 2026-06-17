'use client';

import { useEffect } from "react";
import Link from "next/link";
import {
    SidebarProvider,
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
    LayoutDashboard,
    Users,
    Activity,
    FlaskConical,
    Settings,
    User,
    Building2,
    LogOut,
    ChevronRight
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [isLoading, user, router]);

    interface SubMenuItem {
        title: string;
        url: string;
        roles?: string[];
    }

    interface MenuItem {
        title: string;
        icon: any;
        url?: string;
        roles: string[];
        items?: SubMenuItem[];
    }

    const menuItems: MenuItem[] = [
        {
            title: "Dashboard",
            icon: LayoutDashboard,
            url: "/dashboard",
            roles: ["ADMIN", "CLINIC_USER"]
        },
        {
            title: "Clinics",
            icon: Building2,
            url: "/dashboard/clinics",
            roles: ["ADMIN"]
        },
        {
            title: "Patients",
            icon: Users,
            url: "/dashboard/patients",
            roles: ["ADMIN", "CLINIC_USER"]
        },
        {
            title: "Diagnostic Workflows",
            icon: Activity,
            url: "/dashboard/workflows",
            roles: ["ADMIN", "CLINIC_USER"]
        },
        {
            title: "Lab Results",
            icon: FlaskConical,
            url: "/dashboard/lab-results",
            roles: ["ADMIN", "CLINIC_USER"]
        },
        {
            title: "Settings",
            icon: Settings,
            url: "/dashboard/settings",
            roles: ["ADMIN"]
        },
        {
            title: "My Profile",
            icon: User,
            url: "/dashboard/profile",
            roles: ["CLINIC_USER"]
        },
    ];

    const filteredItems = menuItems
        .filter(item => item.roles.includes(user?.role || ''))
        .map(item => ({
            ...item,
            items: item.items?.filter(subItem => !subItem.roles || subItem.roles.includes(user?.role || ''))
        }));

    const isNavActive = (url: string) =>
        url === '/dashboard' ? pathname === url : pathname === url || pathname.startsWith(url + '/');

    if (isLoading) return <div className="flex h-screen items-center justify-center p-8">Loading session...</div>;
    if (!user) return null;

    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full">
                <Sidebar className="border-r border-border bg-card">
                    <SidebarHeader className="p-4 border-b border-border">
                        <div className="flex items-center gap-2">
                            <div className="bg-primary w-8 h-8 rounded-md flex items-center justify-center text-primary-foreground font-bold italic">F</div>
                            <h1 className="text-xl font-bold text-primary">Frigo Labs</h1>
                        </div>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarGroupLabel>
                                {user?.role === 'ADMIN' ? 'Frigo Labs Team' : 'Clinic Navigation'}
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {filteredItems.map((item) => (
                                        <SidebarMenuItem key={item.title}>
                                            {item.items ? (
                                                <Collapsible defaultOpen className="group/collapsible">
                                                    <CollapsibleTrigger render={
                                                        <SidebarMenuButton tooltip={item.title}>
                                                            <item.icon className="w-5 h-5 text-primary" />
                                                            <span>{item.title}</span>
                                                            <ChevronRight className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                                                        </SidebarMenuButton>
                                                    } />
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub>
                                                            {item.items.map((subItem) => (
                                                                <SidebarMenuSubItem key={subItem.title}>
                                                                    <SidebarMenuSubButton
                                                                        isActive={isNavActive(subItem.url)}
                                                                        render={<Link href={subItem.url}>{subItem.title}</Link>}
                                                                    />
                                                                </SidebarMenuSubItem>
                                                            ))}
                                                        </SidebarMenuSub>
                                                    </CollapsibleContent>
                                                </Collapsible>
                                            ) : (
                                                <SidebarMenuButton
                                                    isActive={isNavActive(item.url || '')}
                                                    tooltip={item.title}
                                                    render={
                                                        <Link href={item.url || "/"}>
                                                            <item.icon className="w-5 h-5 text-primary" />
                                                            <span>{item.title}</span>
                                                        </Link>
                                                    }
                                                />
                                            )}
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter className="p-4 border-t border-border">
                        <div className="flex items-center gap-3 p-2 mb-4 bg-muted rounded-md overflow-hidden">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{user?.name || user?.email}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{user?.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                logout();
                                router.push('/login');
                            }}
                            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors w-full px-2"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Sign Out</span>
                        </button>
                    </SidebarFooter>
                </Sidebar>
                <main className="flex-1 p-8 bg-background">
                    {children}
                </main>
            </div>
        </SidebarProvider>
    );
}
