"use client";

import { useEffect, useState } from "react";
import { createProfile, getStoredProfile, saveProfile } from "@/app/lib/localProfile";
import { supabaseBrowser } from "@/app/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredProfile();
    if (stored?.username) {
      router.replace("/city");
      return;
    }
    setLoading(false);
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const trimmed = username.trim();
    if (!trimmed) {
      setSaving(false);
      return;
    }
    const stored = getStoredProfile();
    const profile = stored ? { ...stored, username: trimmed } : createProfile(trimmed);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: profile.id, username: profile.username }, { onConflict: "id" });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    saveProfile(profile);
    router.replace("/city");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white/70">
        Loading profile...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="glass w-full max-w-lg rounded-3xl p-10 text-center shadow-glow">
        <h2 className="text-3xl font-semibold">Choose a display name</h2>
        <p className="mt-3 text-sm text-white/60">
          This is the name other players will see on the map.
        </p>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="RunQueen, StreetFox, ..."
          className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
        />
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving || !username.trim()}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </main>
  );
}
