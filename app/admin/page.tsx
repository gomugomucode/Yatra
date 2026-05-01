'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import StatsOverview from '@/components/admin/StatsOverview';
import ActiveBusMap from '@/components/admin/ActiveBusMap';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeToBuses, subscribeToBookings } from '@/lib/firebaseDb';
import { Bus, Booking } from '@/lib/types';
import { Loader2 } from 'lucide-react';

export default function AdminDashboard() {
    const { role, loading: authLoading, currentUser } = useAuth();
    const router = useRouter();

    const [buses, setBuses] = useState<Bus[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    // Auth Guard
    useEffect(() => {
        if (!authLoading) {
            if (!currentUser || role !== 'admin') {
                router.replace('/auth?redirect=/admin');
            }
        }
    }, [authLoading, currentUser, role, router]);

    // Data Subscription
    useEffect(() => {
        const unsubscribeBuses = subscribeToBuses((data) => {
            setBuses(data);
        });

        // Pass 'admin' as ID since it's ignored for admin role
        const unsubscribeBookings = subscribeToBookings('admin', 'admin', (data) => {
            setBookings(data);
            setLoading(false);
        });

        return () => {
            unsubscribeBuses();
            unsubscribeBookings();
        };
    }, []);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
        );
    }

    // Calculate Stats
    const activeBuses = buses.filter(b => b.isActive).length;
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.fare || 0), 0);

    return (
        <AdminLayout>
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard Overview</h1>
                    <p className="text-slate-600">Welcome back, Admin. Here's what's happening today.</p>
                </div>

                <StatsOverview
                    totalBuses={buses.length}
                    activeBuses={activeBuses}
                    totalBookings={bookings.length}
                    totalRevenue={totalRevenue}
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Live Map - Takes up 2 columns */}
                    <div className="lg:col-span-2 bg-slate-50 border border-slate-100 rounded-xl p-4 h-125 flex flex-col">
                        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Live Fleet Map
                        </h2>
                        <div className="flex-1 rounded-lg overflow-hidden border border-slate-100">
                            <ActiveBusMap />
                        </div>
                    </div>

                    {/* Recent Activity / Quick Actions - Takes up 1 column */}
                    <div className="space-y-8">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Bookings</h2>
                            <div className="space-y-4">
                                {bookings.slice(-5).reverse().map((booking) => (
                                    <div key={booking.id} className="flex items-center justify-between p-3 bg-white/50 rounded-lg border border-slate-100/50">
                                        <div>
                                            <p className="font-medium text-slate-900">{booking.passengerName}</p>
                                            <p className="text-xs text-slate-600">
                                                {new Date(booking.timestamp).toLocaleTimeString()} • {booking.paymentMethod || 'Cash'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-emerald-400">Rs. {booking.fare}</p>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${booking.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-100 text-slate-600' }`}>
                                                {booking.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {bookings.length === 0 && (
                                    <p className="text-slate-600 text-sm text-center py-4">No bookings yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
