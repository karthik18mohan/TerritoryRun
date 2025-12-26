"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TrackingMode = "walk_run" | "cycle";
export type TrackPoint = {
  lat: number;
  lng: number;
  ts: string;
  accuracy?: number;
  speed?: number | null;
  snapped?: boolean;
  snappedLat?: number;
  snappedLng?: number;
};

type TrackingStatus = {
  isTracking: boolean;
  paused: boolean;
  error?: string;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
};

const STORAGE_KEY = "territoryrun_session_buffer";

export const useGeolocationTracking = () => {
  const [status, setStatus] = useState<TrackingStatus>({
    isTracking: false,
    paused: false,
    wakeLockSupported: typeof navigator !== "undefined" && "wakeLock" in navigator,
    wakeLockActive: false
  });
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const watcherId = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const persistTimer = useRef<NodeJS.Timeout | null>(null);

  const persistPoints = useCallback((current: TrackPoint[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }, []);

  const hydrate = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as TrackPoint[];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    setPoints(hydrate());
  }, [hydrate]);

  const stopWatch = useCallback(() => {
    if (watcherId.current !== null) {
      navigator.geolocation.clearWatch(watcherId.current);
      watcherId.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setStatus((prev) => ({ ...prev, wakeLockActive: true }));
    } catch {
      setStatus((prev) => ({ ...prev, wakeLockActive: false }));
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } finally {
      wakeLockRef.current = null;
      setStatus((prev) => ({ ...prev, wakeLockActive: false }));
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus((prev) => ({ ...prev, error: "Geolocation not supported." }));
      return;
    }
    setStatus((prev) => ({ ...prev, isTracking: true, paused: false, error: undefined }));
    requestWakeLock();

    watcherId.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPoint: TrackPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          ts: new Date(position.timestamp).toISOString(),
          accuracy: position.coords.accuracy,
          speed: position.coords.speed
        };
        setPoints((prev) => {
          const next = [...prev, newPoint];
          return next;
        });
      },
      (error) => {
        setStatus((prev) => ({ ...prev, error: error.message }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  }, [requestWakeLock]);

  const stopTracking = useCallback(() => {
    stopWatch();
    releaseWakeLock();
    setStatus((prev) => ({ ...prev, isTracking: false, paused: false }));
  }, [releaseWakeLock, stopWatch]);

  const pauseTracking = useCallback(() => {
    stopWatch();
    setStatus((prev) => ({ ...prev, paused: true }));
  }, [stopWatch]);

  const resumeTracking = useCallback(() => {
    if (!status.isTracking) return;
    setStatus((prev) => ({ ...prev, paused: false }));
    startTracking();
  }, [startTracking, status.isTracking]);

  useEffect(() => {
    if (!status.isTracking) return undefined;
    const handler = () => {
      if (document.hidden) {
        pauseTracking();
      } else {
        resumeTracking();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [pauseTracking, resumeTracking, status.isTracking]);

  useEffect(() => {
    if (!status.isTracking) return undefined;
    persistTimer.current = setInterval(() => {
      persistPoints(points);
    }, 3000);
    return () => {
      if (persistTimer.current) clearInterval(persistTimer.current);
    };
  }, [persistPoints, points, status.isTracking]);

  const clearStoredPoints = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPoints([]);
  }, []);

  return {
    status,
    points,
    setPoints,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    clearStoredPoints
  };
};
