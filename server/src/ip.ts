import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/**
 * Returns the client's IP address for a request. With `trustProxy`, the last
 * X-Forwarded-For entry is used: that is the address our own reverse proxy
 * saw, whereas earlier entries are supplied by the client and can be forged.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const joined = Array.isArray(header) ? header.join(',') : header;
    const last = joined
      ?.split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .at(-1);
    if (last) return normalizeAddress(last);
  }
  return normalizeAddress(req.socket.remoteAddress ?? 'unknown');
}

/** Strips brackets, zone ids and the IPv4-mapped IPv6 prefix. */
export function normalizeAddress(address: string): string {
  let result = address.trim();
  if (result.startsWith('[') && result.includes(']')) {
    result = result.slice(1, result.indexOf(']'));
  }
  const zone = result.indexOf('%');
  if (zone !== -1) result = result.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(result);
  if (mapped) result = mapped[1];
  return result.toLowerCase();
}

/**
 * The identity a cooldown is tracked under. IPv4 addresses are used as-is;
 * IPv6 addresses are bucketed by /64 because a single subscriber usually
 * controls a whole /64 and could otherwise rotate addresses at will.
 */
export function cooldownKey(address: string): string {
  if (isIP(address) !== 6) return address;
  const groups = expandIPv6(address);
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : address;
}

function expandIPv6(address: string): string[] | null {
  let text = address.toLowerCase();
  const embedded = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number);
    text = text.slice(0, embedded.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...new Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => group.padStart(4, '0'));
}
