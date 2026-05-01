'use client';

import { useState, useEffect } from 'react';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RealtimeTestPage() {
  const [currentValue, setCurrentValue] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('Never');
  const [testBusId] = useState('test-bus-1');
  const [manualLat, setManualLat] = useState('27.6588');
  const [manualLng, setManualLng] = useState('83.4534');

  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    const locationRef = ref(db, `buses/${testBusId}/currentLocation`);

    console.log('[TEST] Setting up Firebase listener for:', `buses/${testBusId}/currentLocation`);

    const unsubscribe = onValue(locationRef, (snapshot) => {
      const data = snapshot.val();
      console.log('[TEST] Received Firebase update:', data);
      setCurrentValue(data);
      if (data?.timestamp) {
        const updateTime = new Date(data.timestamp);
        const secondsAgo = Math.floor((Date.now() - updateTime.getTime()) / 1000);
        setLastUpdate(`${secondsAgo}s ago (${updateTime.toLocaleTimeString()})`);
      } else {
        setLastUpdate('Just now');
      }
    }, (error) => {
      console.error('[TEST] Firebase listener error:', error);
    });

    return () => {
      console.log('[TEST] Cleaning up listener');
      unsubscribe();
    };
  }, [testBusId]);

  const handleManualUpdate = async () => {
    const db = getDatabase(getFirebaseApp());
    const locationRef = ref(db, `buses/${testBusId}/currentLocation`);

    const locationData = {
      lat: parseFloat(manualLat),
      lng: parseFloat(manualLng),
      timestamp: new Date().toISOString(),
      heading: Math.random() * 360,
      speed: 30 + Math.random() * 20,
    };

    console.log('[TEST] Manually updating Firebase:', locationData);

    try {
      await set(locationRef, locationData);
      console.log('[TEST] ✅ Manual update successful');
    } catch (error) {
      console.error('[TEST] ❌ Manual update failed:', error);
    }
  };

  const handleReadFromFirebase = async () => {
    const db = getDatabase(getFirebaseApp());
    const locationRef = ref(db, `buses/${testBusId}/currentLocation`);

    try {
      const { get } = await import('firebase/database');
      const snapshot = await get(locationRef);
      const data = snapshot.val();
      console.log('[TEST] Read from Firebase:', data);
      setCurrentValue(data);
      if (data?.timestamp) {
        const updateTime = new Date(data.timestamp);
        setLastUpdate(`Read: ${updateTime.toLocaleTimeString()}`);
      }
    } catch (error) {
      console.error('[TEST] ❌ Read failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Real-time Location Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Current Firebase Value</h3>
              <pre className="bg-slate-50 p-4 rounded text-xs overflow-auto">
                {currentValue ? JSON.stringify(currentValue, null, 2) : 'No data'}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Last Update</h3>
              <p className="text-sm text-slate-600">{lastUpdate}</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Manual Update</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="Latitude"
                  className="flex-1 px-3 py-2 bg-slate-50 rounded border border-slate-200 text-white"
                  step="0.0001"
                />
                <input
                  type="number"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="Longitude"
                  className="flex-1 px-3 py-2 bg-slate-50 rounded border border-slate-200 text-white"
                  step="0.0001"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleManualUpdate} className="flex-1">
                  Update Firebase
                </Button>
                <Button onClick={handleReadFromFirebase} variant="outline" className="flex-1">
                  Read from Firebase
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="font-semibold mb-2">Debug Info</h3>
              <div className="text-xs text-slate-600 space-y-1">
                <p>Bus ID: {testBusId}</p>
                <p>Path: buses/{testBusId}/currentLocation</p>
                <p>Check browser console for detailed logs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

