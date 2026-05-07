'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DriverError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        console.error('[Driver Error Boundary]', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6 shadow-sm border border-red-200">
                <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-foreground mb-2">Command Center Error</h2>
            <p className="text-muted-foreground text-sm mb-8 max-w-sm">
                We encountered a critical error while loading the driver dashboard. Please try again or return home.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button 
                    onClick={() => reset()}
                    className="h-12 px-6 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-xl w-full sm:w-auto"
                >
                    Restart Dashboard
                </Button>
                <Button 
                    variant="outline" 
                    onClick={() => router.push('/')}
                    className="h-12 px-6 font-bold bg-card border-border hover:bg-slate-100 rounded-xl w-full sm:w-auto"
                >
                    <Home className="w-4 h-4 mr-2" />
                    Return Home
                </Button>
            </div>
        </div>
    );
}
