const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

export interface PushoverMessage {
  title: string;
  message: string;
  /** 0 = normal, no acknowledgement required. 2 = emergency, requires acknowledgement (retry/expire apply). */
  priority?: 0 | 2;
  /** Seconds between retries while unacknowledged. Required by Pushover when priority is 2 (min 30). */
  retry?: number;
  /** Seconds after which Pushover stops retrying an unacknowledged alert. Required when priority is 2 (max 10800). */
  expire?: number;
}

/**
 * Sends a Pushover notification. Credentials come from PUSHOVER_TOKEN / PUSHOVER_USER
 * env vars (passed to the Docker container) — if either is missing, the call is
 * skipped with a warning rather than failing the caller.
 */
export async function sendPushoverNotification(msg: PushoverMessage): Promise<boolean> {
  const token = process.env['PUSHOVER_TOKEN'];
  const user = process.env['PUSHOVER_USER'];
  if (!token || !user) {
    console.warn(`[pushover] PUSHOVER_TOKEN/PUSHOVER_USER not configured — skipping notification "${msg.title}"`);
    return false;
  }

  const priority = msg.priority ?? 0;
  const body = new URLSearchParams({
    token,
    user,
    title: msg.title,
    message: msg.message,
    priority: String(priority),
  });
  if (priority === 2) {
    body.set('retry', String(msg.retry ?? 300));
    body.set('expire', String(msg.expire ?? 10800));
  }

  try {
    const res = await fetch(PUSHOVER_API_URL, { method: 'POST', body });
    if (!res.ok) {
      console.error(`[pushover] API error ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[pushover] request failed:', err);
    return false;
  }
}
