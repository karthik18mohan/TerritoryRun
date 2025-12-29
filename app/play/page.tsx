"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapView } from "@/app/components/MapView";
import { useGeolocationTracking, TrackPoint, TrackingMode } from "@/app/hooks/useGeolocationTracking";
import { useRealtimeTerritories } from "@/app/hooks/useRealtimeTerritories";
import { useLivePlayers } from "@/app/hooks/useLivePlayers";
import { getStoredProfile, LocalProfile } from "@/app/lib/localProfile";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

const haversineDistance = (a: TrackPoint, b: TrackPoint) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

type CityInfo = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
};

const MODE_CONFIG = {
  walk_run: { minPerimeter: 200 },
  cycle: { minPerimeter: 1000 }
};

const buildPolygonWkt = (points: TrackPoint[]) => {
  if (points.length < 3) return null;
  const coordinates = points.map((point) => `${point.lng} ${point.lat}`);
  const closed = [...coordinates, coordinates[0]];
  return `MULTIPOLYGON(((${closed.join(",")})))`;
};

const buildLineStringWkt = (points: TrackPoint[]) => {
  if (!points.length) return null;
  const path = points.map((point) => `${point.lng} ${point.lat}`).join(",");
  return `LINESTRING(${path})`;
};

export default function PlayPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [city, setCity] = useState<CityInfo | null>(null);
  const [mode, setMode] = useState<TrackingMode>("walk_run");
  const [liveMode, setLiveMode] = useState(false);
  const [styleOption, setStyleOption] = useState<"street" | "satellite">("street");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snappedCount, setSnappedCount] = useState(0);
  const [unsnappedCount, setUnsnappedCount] = useState(0);
  const [loopClosed, setLoopClosed] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [profileUsername, setProfileUsername] = useState<string>("Runner");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [geoPermission, setGeoPermission] = useState<PermissionState | "unknown">("unknown");
  const { status, points, setPoints, startTracking, stopTracking, clearStoredPoints } =
    useGeolocationTracking();
  const lastLiveUpdateRef = useRef<number>(0);

  const { territories } = useRealtimeTerritories(city?.id, (message) => {
    setStatusMessage(message);
  });
  const { players } = useLivePlayers(city?.id, liveMode);
  const getBestCoord = useCallback((point: TrackPoint) => {
    if (point.snappedLat != null && point.snappedLng != null) {
      return { lat: point.snappedLat, lng: point.snappedLng };
    }
    return { lat: point.lat, lng: point.lng };
  }, []);

  const bestPoints = useMemo(
    () =>
      points.map((point) => {
        const best = getBestCoord(point);
        return { ...point, lat: best.lat, lng: best.lng };
      }),
    [getBestCoord, points]
  );
  const displayTrailPoints = useMemo(() => bestPoints.slice(-500), [bestPoints]);
  const lastPoint = points[points.length - 1];
  const lastPointAgeSeconds = lastPoint
    ? Math.max(0, Math.round((Date.now() - new Date(lastPoint.ts).getTime()) / 1000))
    : null;

  const elapsedSeconds = useMemo(() => {
    if (!points.length) return 0;
    const start = new Date(points[0].ts).getTime();
    const end = new Date(points[points.length - 1].ts).getTime();
    return Math.max(0, Math.round((end - start) / 1000));
  }, [points]);

  const pathLengthM = useMemo(() => {
    if (bestPoints.length < 2) return 0;
    return bestPoints
      .slice(1)
      .reduce((total, point, index) => total + haversineDistance(point, bestPoints[index]), 0);
  }, [bestPoints]);

  const closeEnough = useMemo(() => {
    if (bestPoints.length < 2) return false;
    return haversineDistance(bestPoints[0], bestPoints[bestPoints.length - 1]) <= 20;
  }, [bestPoints]);

  const perimeterEstimateM = useMemo(() => {
    if (bestPoints.length < 2) return 0;
    const closure = closeEnough
      ? haversineDistance(bestPoints[0], bestPoints[bestPoints.length - 1])
      : 0;
    return pathLengthM + closure;
  }, [bestPoints, closeEnough, pathLengthM]);

  const meetsClaimRules = useMemo(() => {
    const minSeconds = 600;
    const minPoints = 50;
    return (
      elapsedSeconds >= minSeconds &&
      points.length >= minPoints &&
      closeEnough &&
      perimeterEstimateM >= MODE_CONFIG[mode].minPerimeter
    );
  }, [closeEnough, elapsedSeconds, mode, perimeterEstimateM, points.length]);

  const upsertLive = useCallback(
    async (lastPoint: TrackPoint) => {
      if (!liveMode || !sessionId || !city) return;
      const now = Date.now();
      if (now - lastLiveUpdateRef.current < 2000) return;
      lastLiveUpdateRef.current = now;
      if (!profile?.id) return;
      const trail = points.slice(-50).map((point) => {
        const best = getBestCoord(point);
        return { ...point, lat: best.lat, lng: best.lng };
      });
      const lineWkt = buildLineStringWkt(trail);

      await supabase
        .from("live_players")
        .upsert({
          user_id: profile.id,
          city_id: city.id,
          username: profileUsername,
          is_live: true,
          last_ts: new Date().toISOString(),
          last_point: `SRID=4326;POINT(${lastPoint.lng} ${lastPoint.lat})`,
          last_trail: lineWkt ? `SRID=4326;${lineWkt}` : null
        });
    },
    [city, getBestCoord, liveMode, points, profile, profileUsername, sessionId, supabase]
  );

  const [snapError, setSnapError] = useState<string | null>(null);
  const [pointUpsertError, setPointUpsertError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const upsertPoint = useCallback(
    async (point: TrackPoint) => {
      if (!sessionId) return;
      const { error } = await supabase.from("session_points").upsert(
        {
          session_id: sessionId,
          ts: point.ts,
          raw_geom: `SRID=4326;POINT(${point.lng} ${point.lat})`,
          snapped_geom:
            point.snappedLat && point.snappedLng
              ? `SRID=4326;POINT(${point.snappedLng} ${point.snappedLat})`
              : null,
          snapped: point.snapped ?? false,
          accuracy_m: point.accuracy,
          speed_mps: point.speed ?? null
        },
        { onConflict: "session_id,ts" }
      );
      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.log("Point upsert failed", error);
        }
        setPointUpsertError(error.message);
        const message = error.message.includes("Point outside city boundary")
          ? "Point outside city boundary. Ignored."
          : `Point save failed: ${error.message}`;
        setStatusMessage(message);
        return;
      }
      setPointUpsertError(null);
    },
    [sessionId, setStatusMessage, supabase]
  );

  const upsertSnappedPoints = useCallback(
    async (snappedPoints: TrackPoint[]) => {
      if (!sessionId || snappedPoints.length === 0) return;
      const payload = snappedPoints.map((point) => ({
        session_id: sessionId,
        ts: point.ts,
        raw_geom: `SRID=4326;POINT(${point.lng} ${point.lat})`,
        snapped_geom:
          point.snappedLat && point.snappedLng
            ? `SRID=4326;POINT(${point.snappedLng} ${point.snappedLat})`
            : null,
        snapped: point.snapped ?? false,
        accuracy_m: point.accuracy,
        speed_mps: point.speed ?? null
      }));
      const { error } = await supabase
        .from("session_points")
        .upsert(payload, { onConflict: "session_id,ts" });
      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.log("Snapped point upsert failed", error);
        }
        setPointUpsertError(error.message);
        return;
      }
      setPointUpsertError(null);
    },
    [sessionId, supabase]
  );

  const snapBatchRef = useRef<number>(0);

  useEffect(() => {
    const loadCity = async () => {
      const stored = localStorage.getItem("territoryrun_city");
      if (!stored) {
        router.replace("/city");
        return;
      }
      setCity(JSON.parse(stored) as CityInfo);
      const storedProfile = getStoredProfile();
      if (!storedProfile) {
        router.replace("/setup");
        return;
      }
      setProfile(storedProfile);
      if (storedProfile.username) setProfileUsername(storedProfile.username);
    };
    loadCity();
  }, [router]);

  useEffect(() => {
    if (!("permissions" in navigator) || !navigator.permissions?.query) {
      setGeoPermission("unknown");
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        setGeoPermission(result.state);
        result.onchange = () => setGeoPermission(result.state);
      })
      .catch(() => setGeoPermission("unknown"));
  }, []);

  useEffect(() => {
    if (!status.isTracking) return;
    if (!points.length) return;
    const lastPoint = points[points.length - 1];
    upsertLive(lastPoint);
    upsertPoint(lastPoint);
  }, [points, status.isTracking, upsertLive, upsertPoint]);

  useEffect(() => {
    if (!status.isTracking) return;
    if (points.length < 5) return;
    if (snapBatchRef.current === points.length) return;
    snapBatchRef.current = points.length;
    const batch = points.slice(-5);

    const snap = async () => {
      try {
        const response = await fetch("/api/snap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: batch, mode })
        });
        if (!response.ok) {
          setSnapError(`Snap failed (${response.status})`);
          return;
        }
        const data = await response.json();
        const snappedPoints = data.points as TrackPoint[];
        setSnapError(data.error ?? null);
        const snappedMap = new Map(snappedPoints.map((point) => [point.ts, point]));
        setPoints((prev) =>
          prev.map((point) => (snappedMap.has(point.ts) ? { ...point, ...snappedMap.get(point.ts) } : point))
        );
        setSnappedCount((prev) => prev + snappedPoints.filter((p) => p.snapped).length);
        setUnsnappedCount((prev) => prev + snappedPoints.filter((p) => !p.snapped).length);
        await upsertSnappedPoints(snappedPoints);
      } catch (error) {
        setSnapError((error as Error).message);
      }
    };

    snap();
  }, [mode, points, setPoints, status.isTracking, upsertSnappedPoints]);

  useEffect(() => {
    setLoopClosed(meetsClaimRules);
  }, [meetsClaimRules]);

  const handleStart = async () => {
    setStatusMessage(null);
    clearStoredPoints();
    if (!profile?.id || !city) {
      setStatusMessage("Missing player profile. Please set a username.");
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: profile.id,
        city_id: city.id,
        mode,
        live_mode: liveMode,
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.log("Session start failed", error);
      }
      setStatusMessage(error.message);
      return;
    }
    if (data) {
      setSessionId(data.id);
      startTracking();
    }
  };

  const handleStop = async () => {
    stopTracking();
    if (!sessionId) return;
    if (!profile?.id || !city) return;

    if (liveMode) {
      await supabase
        .from("live_players")
        .update({
          is_live: false,
          updated_at: new Date().toISOString(),
          last_ts: new Date().toISOString()
        })
        .eq("user_id", profile.id)
        .eq("city_id", city.id);
    }

    if (meetsClaimRules) {
      const polygonWkt = buildPolygonWkt(bestPoints);
      if (!polygonWkt) {
        setStatusMessage("Need at least 3 points to claim.");
      } else {
        const { data: claimData, error: claimError } = await supabase.rpc("claim_territory", {
          p_user_id: profile.id,
          p_city_id: city.id,
          p_session_id: sessionId,
          p_polygon: `SRID=4326;${polygonWkt}`
        });
        if (claimError) {
          setStatusMessage(claimError.message);
          setClaimError(claimError.message);
        } else {
          setStatusMessage(
            claimData?.message ?? "Territory claimed! Check the map for updates."
          );
          setClaimError(null);
        }
      }
    } else {
      setStatusMessage("Loop not closed or requirements unmet.");
    }

    await supabase
      .from("sessions")
      .update({
        ended_at: new Date().toISOString(),
        closed_loop: meetsClaimRules,
        distance_m: pathLengthM,
        perimeter_m: perimeterEstimateM
      })
      .eq("id", sessionId);

    setSessionId(null);
  };

  if (!city) {
    return <main className="flex min-h-screen items-center justify-center">Loading...</main>;
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{city.name} Run</h1>
            <p className="text-sm text-white/60">Close your loop to claim territory.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                styleOption === "street" ? "bg-white text-black" : "bg-white/10 text-white"
              }`}
              onClick={() => setStyleOption("street")}
            >
              Street
            </button>
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                styleOption === "satellite" ? "bg-white text-black" : "bg-white/10 text-white"
              }`}
              onClick={() => setStyleOption("satellite")}
            >
              Satellite
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2.2fr,1fr]">
          <div className="h-[65vh]">
            <MapView
              center={[city.center_lng, city.center_lat]}
              zoom={city.default_zoom}
              styleOption={styleOption}
              territories={territories}
              livePlayers={players}
              trailPoints={displayTrailPoints}
              showLive={liveMode}
            />
          </div>

          <section className="glass flex flex-col gap-4 rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/60">Tracking Controls</div>
                <div className="text-xs text-white/40">Low-latency live updates</div>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60">
                {status.isTracking ? "Active" : "Idle"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode("walk_run")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  mode === "walk_run" ? "bg-emerald-400 text-black" : "bg-white/10 text-white"
                }`}
              >
                Walk / Run
              </button>
              <button
                onClick={() => setMode("cycle")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  mode === "cycle" ? "bg-emerald-400 text-black" : "bg-white/10 text-white"
                }`}
              >
                Cycle
              </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs">
              <span>Live Mode</span>
              <button
                onClick={() => setLiveMode((prev) => !prev)}
                className={`rounded-full px-4 py-1 text-xs font-semibold ${
                  liveMode ? "bg-purple-400 text-black" : "bg-white/10 text-white"
                }`}
              >
                {liveMode ? "On" : "Off"}
              </button>
            </div>

            <div className="grid gap-3 rounded-2xl bg-white/5 p-4 text-xs sm:grid-cols-2">
              <div className="flex items-center justify-between">
                <span>Elapsed</span>
                <span>
                  {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Points</span>
                <span>{points.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Path length</span>
                <span>{pathLengthM.toFixed(0)} m</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Loop ready</span>
                <span className={loopClosed ? "text-emerald-400" : "text-white/60"}>
                  {loopClosed ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <span>Snapped</span>
                <span>
                  {snappedCount} / {snappedCount + unsnappedCount}
                </span>
              </div>
              {status.isTracking && lastPoint && (
                <div className="flex items-center justify-between sm:col-span-2">
                  <span>GPS active</span>
                  <span>
                    {lastPointAgeSeconds ?? 0}s ago ·{" "}
                    {lastPoint.accuracy ? `${Math.round(lastPoint.accuracy)}m` : "n/a"}
                  </span>
                </div>
              )}
            </div>

            {status.paused && (
              <div className="rounded-2xl bg-amber-500/20 px-4 py-3 text-xs text-amber-200">
                Paused because app is in background.
              </div>
            )}
            {status.error && (
              <div className="rounded-2xl bg-red-500/20 px-4 py-3 text-xs text-red-200">
                {status.error}
                {status.error.toLowerCase().includes("denied") && (
                  <div className="mt-2 text-[11px] text-red-100/80">
                    Enable location access in your browser/app settings, then reload and try
                    again.
                  </div>
                )}
              </div>
            )}
            {!status.wakeLockSupported && (
              <div className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/60">
                Screen Wake Lock unsupported. Keep your screen on to avoid pausing.
              </div>
            )}

            {(process.env.NODE_ENV !== "production" || showDiagnostics) && (
              <div className="rounded-2xl bg-white/5 px-4 py-3 text-[11px] text-white/70">
                <div className="mb-2 text-xs font-semibold text-white">Diagnostics</div>
                <div className="space-y-1">
                  <div>Secure context: {String(window.isSecureContext)}</div>
                  <div>Geolocation supported: {"geolocation" in navigator ? "yes" : "no"}</div>
                  <div>Permission: {geoPermission}</div>
                  <div>
                    Last coords:{" "}
                    {lastPoint
                      ? `${lastPoint.lat.toFixed(5)}, ${lastPoint.lng.toFixed(5)}`
                      : "n/a"}
                  </div>
                  <div>Accuracy: {lastPoint?.accuracy ? `${Math.round(lastPoint.accuracy)}m` : "n/a"}</div>
                  <div>Session ID: {sessionId ?? "none"}</div>
                  <div>Snap error: {snapError ?? "none"}</div>
                  <div>Point save error: {pointUpsertError ?? "none"}</div>
                  <div>Claim error: {claimError ?? "none"}</div>
                </div>
              </div>
            )}

            {process.env.NODE_ENV === "production" && (
              <button
                className="self-start text-[11px] text-white/50 underline"
                onClick={() => setShowDiagnostics((prev) => !prev)}
              >
                {showDiagnostics ? "Hide diagnostics" : "Diagnostics"}
              </button>
            )}

            <div className="flex flex-col gap-3">
              {!status.isTracking ? (
                <button
                  onClick={handleStart}
                  className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-glow"
                >
                  Start Tracking
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-glow"
                >
                  Stop & Claim
                </button>
              )}
            </div>

            {statusMessage && (
              <div className="rounded-2xl bg-emerald-500/20 px-4 py-3 text-xs text-emerald-200">
                {statusMessage}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
