"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import { useRouter } from "next/navigation";

type City = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
};

export default function CityPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.session.user.id)
        .maybeSingle();
      if (!profile?.username) {
        router.replace("/setup");
        return;
      }
      const { data } = await supabase
        .from("cities")
        .select("id, name, center_lat, center_lng, default_zoom")
        .order("name");
      setCities((data as City[]) ?? []);
    };
    load();
  }, [router, supabase]);

  const handleSelect = (city: City) => {
    localStorage.setItem("territoryrun_city", JSON.stringify(city));
    router.push("/play");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="glass w-full max-w-3xl rounded-3xl p-10 text-center shadow-glow">
        <h2 className="text-3xl font-semibold">Choose your city</h2>
        <p className="mt-3 text-sm text-white/60">
          Territories and live players are filtered to your city.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {cities.map((city) => (
            <button
              key={city.id}
              onClick={() => handleSelect(city)}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left shadow-neon transition hover:-translate-y-1"
            >
              <div className="text-xl font-semibold">{city.name}</div>
              <div className="mt-2 text-xs text-white/60">Tap to start planning your route.</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
