export type LocalProfile = {
  id: string;
  username: string;
};

const STORAGE_KEY = "territoryrun_profile";

export const getStoredProfile = () => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalProfile;
    if (!parsed?.id || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveProfile = (profile: LocalProfile) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
};

export const createProfile = (username: string) => ({
  id: crypto.randomUUID(),
  username
});
