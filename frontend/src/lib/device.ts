const KEY = 'beautychem.deviceId';

/** Құрылғыны анықтайтын кездейсоқ ID (тарихты бөлу үшін; жеке деректер емес). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (id && /^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;
    id = randomId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'session-' + randomId();
  }
}

function randomId(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
