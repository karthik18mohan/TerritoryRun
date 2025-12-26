"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/city");
    });
  }, [router]);

  const handleLogin = async () => {
    setLoading(true);
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/city` }
    });
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="glass w-full max-w-xl rounded-3xl p-10 text-center shadow-glow">
        <h1 className="text-4xl font-semibold text-white">TerritoryRun</h1>
        <p className="mt-4 text-sm text-white/70">
          Claim the city by closing loops on the map. Track live, steal territory, and
          keep moving.
        </p>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-8 w-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02]"
        >
          {loading ? "Connecting..." : "Sign in with Google"}
        </button>
        <div className="mt-6 text-xs text-white/50">
          Foreground-only tracking. Keep the app open to keep claiming.
        </div>
      </div>
    </main>
  );
}
