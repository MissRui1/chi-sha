export function getOrCreateUserId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const KEY = "chi_sha_uid";
  let uid = localStorage.getItem(KEY);

  if (!uid) {
    uid =
      typeof globalThis.crypto !== "undefined" &&
      "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, uid);
  }

  return uid;
}

export const getUserStorageKey = (
  userId: string,
  key: string
) => `chi_sha:${userId}:${key}`;
