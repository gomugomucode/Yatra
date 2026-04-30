import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bus, Users, Ticket, TrendingUp } from 'lucide-react';

interface StatsOverviewProps {
    totalBuses: number;
    activeBuses: number;
    totalBookings: number;
    totalRevenue: number;
}

export default function StatsOverview({
    totalBuses,
    activeBuses,
    totalBookings,
    totalRevenue,
}: StatsOverviewProps) {
    const stats = [
        {
            title: 'Total Buses',
            value: totalBuses,
            icon: Bus,
            description: `${activeBuses} currently active`,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
        },
        {
            title: 'Total Bookings',
            value: totalBookings,
            icon: Ticket,
            description: '+12% from yesterday',
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
        },
        {
            title: 'Active Users',
            value: '1,234', // Mock for now
            icon: Users,
            description: 'Currently online',
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
        },
        {
            title: 'Total Revenue',
            value: `Rs. ${totalRevenue.toLocaleString()}`,
            icon: TrendingUp,
            description: 'This month',
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
                <Card key={index} className="bg-slate-50 border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                            {stat.title}
                        </CardTitle>
                        <div className={`p-2 rounded-lg ${stat.bg}`}>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{stat.value}</div>
                        <p className="text-xs text-slate-500 mt-1">{stat.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
