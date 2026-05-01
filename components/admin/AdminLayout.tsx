'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Bus, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const { signOut } = useAuth();

    const navItems = [
        { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/admin/buses', label: 'Bus Management', icon: Bus },
    ];

    const [activeAlert, setActiveAlert] = useState<import('@/lib/types').Alert | null>(null);

    useEffect(() => {
        const { subscribeToAlerts } = require('@/lib/firebaseDb');
        const unsubscribe = subscribeToAlerts((alerts: import('@/lib/types').Alert[]) => {
            const active = alerts.find(a => a.status === 'active');
            setActiveAlert(active || null);
        });
        return () => unsubscribe();
    }, []);

    const handleResolveAlert = async () => {
        if (!activeAlert) return;
        const { resolveAlert } = require('@/lib/firebaseDb');
        await resolveAlert(activeAlert.id);
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 flex">
            {/* Alert Banner */}
            {activeAlert && (
                <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white px-4 py-3 shadow-lg animate-pulse flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-full">
                            <span className="text-xl">🚨</span>
                        </div>
                        <div>
                            <p className="font-bold text-lg">EMERGENCY ALERT: {activeAlert.type.toUpperCase()}</p>
                            <p className="text-sm opacity-90">
                                Bus {activeAlert.busNumber} ({activeAlert.driverName}) reported an issue.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            className="bg-white text-red-600 hover:bg-white/90 font-bold"
                            onClick={() => window.open(`https://www.google.com/maps?q=${activeAlert.location.lat},${activeAlert.location.lng}`, '_blank')}
                        >
                            View Location
                        </Button>
                        <Button
                            variant="outline"
                            className="border-white text-white hover:bg-white/20"
                            onClick={handleResolveAlert}
                        >
                            Resolve
                        </Button>
                    </div>
                </div>
            )}

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-white/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-50/90 backdrop-blur-md border-r border-slate-100 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:shrink-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${activeAlert ? 'mt-16' : ''}`}>
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
                    <span className="text-xl font-black bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
                        Yatra Admin
                    </span>
                    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <nav className="p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-cyan-500/10 text-cyan-700 font-bold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <item.icon className="w-5 h-5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => signOut()}
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${activeAlert ? 'mt-16' : ''}`}>
                {/* Header */}
                <header className="h-16 border-b border-slate-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
                        <Menu className="w-5 h-5" />
                    </Button>
                    <div className="ml-auto flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
                                A
                            </div>
                            <span className="text-sm font-medium hidden sm:block text-slate-700">Admin User</span>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
