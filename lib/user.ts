export function getOrCreateUserId(): string {
  const KEY = "chi_sha_uid";
  let uid = localStorage.getItem(KEY);

  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem(KEY, uid);
  }

  return uid;
}
