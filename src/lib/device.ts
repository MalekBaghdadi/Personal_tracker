export function uuid(): string {
  return crypto.randomUUID();
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable; per-device conveniences degrade gracefully */
  }
}

export const local = { get: safeGet, set: safeSet };

let cachedDeviceId: string | null = null;

/** Stable per-device id, used to tell which device started a timer. */
export function deviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id = safeGet('pt.deviceId');
  if (!id) {
    id = uuid();
    safeSet('pt.deviceId', id);
  }
  cachedDeviceId = id;
  return id;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}
