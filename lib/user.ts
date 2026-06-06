const ANON_KEY = "chi_sha_uid";
const ACCOUNT_KEY = "chi_sha_account";

export type StoredAccount = {
  account: string;
  passcode: string;
  userId: string;
};

export const normalizeAccountName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 48);

export const getAccountUserId = (account: string) =>
  `account_${encodeURIComponent(normalizeAccountName(account))}`;

const safeGet = (key: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeRemove = (key: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {}
};

export function getStoredAccount(): StoredAccount | null {
  const raw = safeGet(ACCOUNT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAccount>;
    const account = normalizeAccountName(parsed.account ?? "");
    const passcode = parsed.passcode ?? "";

    if (!account || !passcode) {
      return null;
    }

    return {
      account,
      passcode,
      userId: parsed.userId || getAccountUserId(account),
    };
  } catch {
    return null;
  }
}

export function setStoredAccount(account: string, passcode: string) {
  const normalized = normalizeAccountName(account);
  const userId = getAccountUserId(normalized);

  if (!normalized || !passcode) {
    return null;
  }

  const session: StoredAccount = {
    account: normalized,
    passcode,
    userId,
  };

  safeSet(ACCOUNT_KEY, JSON.stringify(session));
  return session;
}

export function clearStoredAccount() {
  safeRemove(ACCOUNT_KEY);
}

export function getOrCreateUserId(): string {
  const account = getStoredAccount();

  if (account) {
    return account.userId;
  }

  let uid = safeGet(ANON_KEY);

  if (!uid) {
    uid =
      typeof globalThis.crypto !== "undefined" &&
      "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    safeSet(ANON_KEY, uid);
  }

  return uid;
}

export const getUserStorageKey = (
  userId: string,
  key: string
) => `chi_sha:${userId}:${key}`;
