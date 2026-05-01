'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getDb, subscribeToBuses } from '@/lib/firebaseDb';
import { Bus } from '@/lib/types';
import { Loader2, Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { onValue, ref } from 'firebase/database';

type DriverRep = {
    score?: number;
    totalTrips?: number;
    completedTrips?: number;
    zkVerified?: boolean;
    sosTriggered?: number;
};

type DriverProfile = {
    verificationBadge?: { mintAddress?: string };
    isApproved?: boolean;
};

export default function BusManagement() {
    const { role, loading: authLoading, currentUser } = useAuth();
    const [buses, setBuses] = useState<Bus[]>([]);
    const [driverReputation, setDriverReputation] = useState<Record<string, DriverRep>>({});
    const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverProfile>>({});
    const [tripCountByDriver, setTripCountByDriver] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!authLoading && (!currentUser || role !== 'admin')) return;
        const unsubscribe = subscribeToBuses((data) => {
            setBuses(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [authLoading, currentUser, role]);

    useEffect(() => {
        if (!authLoading && (!currentUser || role !== 'admin')) return;
        const db = getDb();
        const usersRef = ref(db, 'users');
        const unsubscribe = onValue(usersRef, (snap) => {
            const value = (snap.val() || {}) as Record<string, DriverProfile>;
            setDriverProfiles(value);
        });
        return () => unsubscribe();
    }, [authLoading, currentUser, role]);

    useEffect(() => {
        if (!authLoading && (!currentUser || role !== 'admin')) return;
        const db = getDb();
        const repRef = ref(db, 'reputation/drivers');
        const unsubscribe = onValue(repRef, (snap) => {
            const value = (snap.val() || {}) as Record<string, DriverRep>;
            setDriverReputation(value);
        });
        return () => unsubscribe();
    }, [authLoading, currentUser, role]);

    useEffect(() => {
        if (!authLoading && (!currentUser || role !== 'admin')) return;
        const db = getDb();
        const tripsRef = ref(db, 'trips');
        const unsubscribe = onValue(tripsRef, (snap) => {
            const trips = (snap.val() || {}) as Record<string, { driverId?: string }>;
            const counts: Record<string, number> = {};
            for (const trip of Object.values(trips)) {
                if (trip.driverId) counts[trip.driverId] = (counts[trip.driverId] || 0) + 1;
            }
            setTripCountByDriver(counts);
        });
        return () => unsubscribe();
    }, [authLoading, currentUser, role]);

    const filteredBuses = buses.filter(bus =>
        bus.busNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bus.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bus.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bus.route.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
        );
    }

    if (!currentUser || role !== 'admin') {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <p className="text-slate-600">Admin access required.</p>
            </div>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Transport Office Dashboard</h1>
                        <p className="text-slate-600">Search by plate number or driver ID to inspect compliance and live status.</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <Input
                            placeholder="Search by plate, route, driver name, or driver ID..."
                            className="pl-9 bg-white border-slate-100 text-slate-900"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow className="border-slate-100 hover:bg-white">
                                <TableHead className="text-slate-600">Bus Number</TableHead>
                                <TableHead className="text-slate-600">Driver</TableHead>
                                <TableHead className="text-slate-600">Route</TableHead>
                                <TableHead className="text-slate-600">Driver ID</TableHead>
                                <TableHead className="text-slate-600">Live Location</TableHead>
                                <TableHead className="text-slate-600">Reputation</TableHead>
                                <TableHead className="text-slate-600">ZK Verified</TableHead>
                                <TableHead className="text-slate-600">Trip History</TableHead>
                                <TableHead className="text-slate-600">Compliance</TableHead>
                                <TableHead className="text-slate-600">Status</TableHead>
                                <TableHead className="text-slate-600">Seats</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBuses.map((bus) => (
                                <TableRow key={bus.id} className="border-slate-100 hover:bg-slate-100/50">
                                    <TableCell className="font-medium text-slate-900">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{bus.emoji}</span>
                                            {bus.busNumber}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-700">{bus.driverName}</TableCell>
                                    <TableCell className="text-slate-700">
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-slate-600" />
                                            {bus.route}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-slate-700">{bus.id}</TableCell>
                                    <TableCell className="text-xs text-slate-700">
                                        {bus.currentLocation
                                            ? `${bus.currentLocation.lat.toFixed(4)}, ${bus.currentLocation.lng.toFixed(4)}`
                                            : '—'}
                                    </TableCell>
                                    <TableCell className="text-slate-700">
                                        {driverReputation[bus.id]?.score != null ? driverReputation[bus.id].score : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={driverProfiles[bus.id]?.verificationBadge?.mintAddress ? 'default' : 'secondary'}
                                            className={driverProfiles[bus.id]?.verificationBadge?.mintAddress
                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                : 'bg-slate-100 text-slate-600 border-slate-200'}
                                        >
                                            {driverProfiles[bus.id]?.verificationBadge?.mintAddress ? 'Verified' : 'Pending'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-700">{tripCountByDriver[bus.id] || 0}</TableCell>
                                    <TableCell className="text-xs text-slate-700">
                                        {(driverProfiles[bus.id]?.isApproved ? 'Approved' : 'Review') +
                                            ` · SOS ${driverReputation[bus.id]?.sosTriggered || 0}`}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={bus.isActive ? 'default' : 'secondary'} className={
                                            bus.isActive
                                                ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/20'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200'
                                        }>
                                            {bus.isActive ? 'Active' : 'Offline'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-700">
                                        {bus.availableSeats} / {bus.capacity}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredBuses.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={11} className="text-center py-8 text-slate-600">
                                        No matching buses found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
