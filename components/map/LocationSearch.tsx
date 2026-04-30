'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface LocationSearchProps {
    onLocationSelect: (location: { lat: number; lng: number; address: string }) => void;
    placeholder?: string;
    className?: string;
}

interface SearchResult {
    place_id: number;
    lat: string;
    lon: string;
    display_name: string;
}

export default function LocationSearch({ onLocationSelect, placeholder = "Search location...", className = "" }: LocationSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 3) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                // Limit to Nepal (viewbox) or just generic
                // Butwal viewbox approx: 83.4, 27.6, 83.5, 27.8
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=np`
                );
                const data = await response.json();
                setResults(data);
                setIsOpen(true);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (result: SearchResult) => {
        onLocationSelect({
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            address: result.display_name.split(',')[0], // Simple address
        });
        setQuery('');
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="pl-9 bg-slate-50/80 border-slate-700 text-white placeholder:text-slate-500 focus:ring-cyan-500"
                />
                {loading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500 animate-spin" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <Card className="absolute top-full left-0 right-0 mt-2 z-50 bg-slate-50 border-slate-700 overflow-hidden shadow-xl">
                    <ul className="max-h-60 overflow-y-auto">
                        {results.map((result) => (
                            <li key={result.place_id}>
                                <button
                                    onClick={() => handleSelect(result)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-800 transition-colors flex items-start gap-3 group"
                                >
                                    <MapPin className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 mt-1 shrink-0" />
                                    <div>
                                        <div className="text-sm font-medium text-slate-200 group-hover:text-white">
                                            {result.display_name.split(',')[0]}
                                        </div>
                                        <div className="text-xs text-slate-500 line-clamp-1">
                                            {result.display_name}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}
