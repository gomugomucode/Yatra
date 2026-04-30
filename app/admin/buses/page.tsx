'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeToBuses } from '@/lib/firebaseDb';
import { Bus } from '@/lib/types';
import { Loader2, Search, MoreHorizontal, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

export default function BusManagement() {
    const { role, loading: authLoading } = useAuth();
    const [buses, setBuses] = useState<Bus[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const unsubscribe = subscribeToBuses((data) => {
            setBuses(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredBuses = buses.filter(bus =>
        bus.busNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Bus Management</h1>
                        <p className="text-slate-600">Manage your fleet and monitor active vehicles.</p>
                    </div>
                    <Button className="bg-cyan-600 hover:bg-cyan-500 text-white">
                        Add New Bus
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <Input
                            placeholder="Search buses..."
                            className="pl-9 bg-white border-slate-100 text-white"
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
                                <TableHead className="text-slate-600">Status</TableHead>
                                <TableHead className="text-slate-600">Seats</TableHead>
                                <TableHead className="text-slate-600 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredBuses.map((bus) => (
                                <TableRow key={bus.id} className="border-slate-100 hover:bg-slate-100/50">
                                    <TableCell className="font-medium text-white">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{bus.emoji}</span>
                                            {bus.busNumber}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-300">{bus.driverName}</TableCell>
                                    <TableCell className="text-slate-300">
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-slate-600" />
                                            {bus.route}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={bus.isActive ? 'default' : 'secondary'} className={
                                            bus.isActive
                                                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-700 border-slate-200'
                                        }>
                                            {bus.isActive ? 'Active' : 'Offline'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                        {bus.availableSeats} / {bus.capacity}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 text-slate-600 hover:text-white">
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-slate-50 border-slate-100 text-white">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem className="hover:bg-slate-100 cursor-pointer">View Details</DropdownMenuItem>
                                                <DropdownMenuItem className="hover:bg-slate-100 cursor-pointer">Edit Bus</DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-400 hover:bg-red-500/10 cursor-pointer">Delete Bus</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
