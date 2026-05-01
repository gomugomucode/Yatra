import { useState, useEffect } from 'react';
import { AlertTriangle, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface AccidentAlertProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    autoConfirmSeconds?: number;
}

export default function AccidentAlert({
    isOpen,
    onConfirm,
    onCancel,
    autoConfirmSeconds = 10
}: AccidentAlertProps) {
    const [secondsLeft, setSecondsLeft] = useState(autoConfirmSeconds);
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        if (!isOpen) {
            setSecondsLeft(autoConfirmSeconds);
            setProgress(100);
            return;
        }

        // Play loud alarm sound
        const audio = new Audio('/sounds/alarm.mp3'); // We'll need to make sure this exists or mock it
        // For now, let's use the browser beep fallback in the parent component or just rely on visual

        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onConfirm();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        const progressTimer = setInterval(() => {
            setProgress((prev) => Math.max(0, prev - (100 / (autoConfirmSeconds * 10))));
        }, 100);

        return () => {
            clearInterval(timer);
            clearInterval(progressTimer);
        };
    }, [isOpen, autoConfirmSeconds, onConfirm]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="bg-white border-red-500 text-slate-900 sm:max-w-md border-2 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-3xl font-black text-red-600 flex items-center gap-3 uppercase tracking-wider">
                        <AlertTriangle className="w-10 h-10 animate-bounce" />
                        Crash Detected
                    </DialogTitle>
                    <DialogDescription className="text-red-700 text-lg font-black">
                        We detected a possible accident. Are you safe?
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="text-center">
                        <div className="text-6xl font-black text-slate-900 mb-2 font-mono">
                            {secondsLeft}
                        </div>
                        <p className="text-red-700 text-sm uppercase tracking-widest font-black">Seconds to Auto-Alert</p>
                    </div>

                    <Progress value={progress} className="h-4 bg-red-50 [&>div]:bg-red-600" />
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-0">
                    <Button
                        variant="ghost"
                        className="w-full sm:w-auto h-14 text-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border-2 border-slate-200 font-bold"
                        onClick={onCancel}
                    >
                        <X className="w-6 h-6 mr-2" />
                        I Am Safe (Cancel)
                    </Button>
                    <Button
                        variant="destructive"
                        className="w-full sm:w-auto h-14 text-lg bg-red-600 hover:bg-red-700 text-white font-black shadow-lg shadow-red-200"
                        onClick={onConfirm}
                    >
                        <Phone className="w-6 h-6 mr-2" />
                        Help Me Now
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
