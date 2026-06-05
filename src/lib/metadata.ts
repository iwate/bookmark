import { validateHttpUrl, type ValidationError } from '../utils/validation.ts';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const DNS_TIMEOUT_MS = 2_000;
const DNS_JSON_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

class MetadataHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MetadataHttpError';
    this.status = status;
  }
}

function throwUrlValidationError(error: ValidationError | null): void {
  if (!error) {
    return;
  }
  throw new MetadataHttpError(400, `url ${error.message}`);
}

function isIpv4(hostname: string): boolean {
  const segments = hostname.split('.');
  if (segments.length !== 4) {
    return false;
  }
  return segments.every((segment) => /^\d+$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255);
}

function ipv4ToUint(hostname: string): number {
  const [a, b, c, d] = hostname.split('.').map(Number);
  return (((a * 256 + b) * 256 + c) * 256 + d) >>> 0;
}

function isIpv4InCidr(hostname: string, network: string, prefixLength: number): boolean {
  const value = ipv4ToUint(hostname);
  const networkValue = ipv4ToUint(network);
  const mask = prefixLength === 0 ? 0 : (0xffff_ffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (networkValue & mask);
}

function isDisallowedIpv4(hostname: string): boolean {
  if (!isIpv4(hostname)) {
    return false;
  }

  return (
    isIpv4InCidr(hostname, '0.0.0.0', 8) ||
    isIpv4InCidr(hostname, '10.0.0.0', 8) ||
    isIpv4InCidr(hostname, '100.64.0.0', 10) ||
    isIpv4InCidr(hostname, '127.0.0.0', 8) ||
    isIpv4InCidr(hostname, '169.254.0.0', 16) ||
    isIpv4InCidr(hostname, '172.16.0.0', 12) ||
    isIpv4InCidr(hostname, '192.0.0.0', 24) ||
    isIpv4InCidr(hostname, '192.0.2.0', 24) ||
    isIpv4InCidr(hostname, '192.88.99.0', 24) ||
    isIpv4InCidr(hostname, '192.168.0.0', 16) ||
    isIpv4InCidr(hostname, '198.18.0.0', 15) ||
    isIpv4InCidr(hostname, '198.51.100.0', 24) ||
    isIpv4InCidr(hostname, '203.0.113.0', 24) ||
    isIpv4InCidr(hostname, '224.0.0.0', 4) ||
    isIpv4InCidr(hostname, '240.0.0.0', 4)
  );
}

function parseIpv6ToBigInt(hostname: string): bigint | null {
  if (!hostname.includes(':')) {
    return null;
  }

  const lower = hostname.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(lower)) {
    return null;
  }

  const [headRaw, tailRaw = ''] = lower.split('::');
  if (lower.split('::').length > 2) {
    return null;
  }

  const head = headRaw ? headRaw.split(':') : [];
  const tail = tailRaw ? tailRaw.split(':') : [];

  if ([...head, ...tail].some((segment) => segment.length > 4 || segment.length === 0)) {
    return null;
  }

  const missing = 8 - (head.length + tail.length);
  if ((lower.includes('::') && missing < 1) || (!lower.includes('::') && missing !== 0)) {
    return null;
  }

  const segments = [...head, ...new Array(Math.max(missing, 0)).fill('0'), ...tail].map((segment) => parseInt(segment || '0', 16));
  if (segments.length !== 8 || segments.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 0xffff)) {
    return null;
  }

  return segments.reduce((acc, segment) => (acc << 16n) + BigInt(segment), 0n);
}

function isDisallowedIpv6(hostname: string): boolean {
  const value = parseIpv6ToBigInt(hostname);
  if (value === null) {
    return false;
  }

  if (value === 0n) {
    return true;
  }

  if (value === 1n) {
    return true;
  }

  const uniqueLocalPrefix = 0xfc00_0000_0000_0000_0000_0000_0000_0000n;
  const linkLocalPrefix = 0xfe80_0000_0000_0000_0000_0000_0000_0000n;
  const multicastPrefix = 0xff00_0000_0000_0000_0000_0000_0000_0000n;
  const mappedIpv4Prefix = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;

  if ((value & 0xfe00_0000_0000_0000_0000_0000_0000_0000n) === uniqueLocalPrefix) {
    return true;
  }
  if ((value & 0xffc0_0000_0000_0000_0000_0000_0000_0000n) === linkLocalPrefix) {
    return true;
  }
  if ((value & 0xff00_0000_0000_0000_0000_0000_0000_0000n) === multicastPrefix) {
    return true;
  }
  if ((value >> 96n) === 0x20010db8n) {
    return true;
  }

  if ((value & 0xffff_ffff_ffff_ffff_ffff_ffff_0000_0000n) === mappedIpv4Prefix) {
    const ipv4 = Number(value & 0xffff_ffffn);
    const a = (ipv4 >>> 24) & 255;
    const b = (ipv4 >>> 16) & 255;
    const c = (ipv4 >>> 8) & 255;
    const d = ipv4 & 255;
    return isDisallowedIpv4(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

type DnsJsonAnswer = {
  type?: number;
  data?: string;
};

type DnsJsonResponse = {
  Status?: number;
  Answer?: DnsJsonAnswer[];
};

async function resolveDnsRecords(hostname: string, recordType: 'A' | 'AAAA'): Promise<string[]> {
  const url = new URL(DNS_JSON_ENDPOINT);
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', recordType);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
    });
  } catch {
    throw new MetadataHttpError(502, 'failed to resolve upstream host');
  }

  if (!response.ok) {
    throw new MetadataHttpError(502, 'failed to resolve upstream host');
  }

  let body: DnsJsonResponse;
  try {
    body = (await response.json()) as DnsJsonResponse;
  } catch {
    throw new MetadataHttpError(502, 'failed to resolve upstream host');
  }

  if (typeof body.Status === 'number' && body.Status !== 0 && body.Status !== 3) {
    throw new MetadataHttpError(502, 'failed to resolve upstream host');
  }

  const expectedType = recordType === 'A' ? 1 : 28;
  const answers = Array.isArray(body.Answer) ? body.Answer : [];
  const addresses: string[] = [];

  for (const answer of answers) {
    if (answer.type !== expectedType || typeof answer.data !== 'string') {
      throw new MetadataHttpError(502, 'failed to resolve upstream host');
    }

    const data = answer.data.trim().toLowerCase();
    if (!data) {
      throw new MetadataHttpError(502, 'failed to resolve upstream host');
    }

    if (recordType === 'A' && !isIpv4(data)) {
      throw new MetadataHttpError(502, 'failed to resolve upstream host');
    }

    if (recordType === 'AAAA' && parseIpv6ToBigInt(data) === null) {
      throw new MetadataHttpError(502, 'failed to resolve upstream host');
    }

    addresses.push(data);
  }

  return addresses;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (isIpv4(hostname) || parseIpv6ToBigInt(hostname) !== null) {
    return [hostname];
  }

  const [aRecords, aaaaRecords] = await Promise.all([resolveDnsRecords(hostname, 'A'), resolveDnsRecords(hostname, 'AAAA')]);
  const addresses = [...aRecords, ...aaaaRecords];

  if (addresses.length === 0) {
    throw new MetadataHttpError(502, 'failed to resolve upstream host');
  }

  return Array.from(new Set(addresses));
}

async function assertSafeResolvedFetchTarget(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  const addresses = await resolveHostAddresses(hostname);

  for (const address of addresses) {
    if (isDisallowedIpv4(address) || isDisallowedIpv6(address)) {
      throw new MetadataHttpError(400, 'url host is not allowed');
    }
  }
}

export function assertSafeFetchTarget(url: URL): void {
  const hostname = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new MetadataHttpError(400, 'url host is not allowed');
  }

  if (isDisallowedIpv4(hostname) || isDisallowedIpv6(hostname)) {
    throw new MetadataHttpError(400, 'url host is not allowed');
  }
}

function extractFirstMetaContent(html: string, attrName: string, attrValue: string): string {
  const metaTagPattern = /<meta\b[^>]*>/gi;
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const tagMatch of html.matchAll(metaTagPattern)) {
    const tag = tagMatch[0];
    let matchedAttr = false;
    let content = '';

    for (const attrMatch of tag.matchAll(attrPattern)) {
      const key = (attrMatch[1] ?? '').toLowerCase();
      const value = (attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '').trim();
      if (key === attrName && value.toLowerCase() === attrValue.toLowerCase()) {
        matchedAttr = true;
      }
      if (key === 'content') {
        content = value;
      }
    }

    if (matchedAttr && content) {
      return content;
    }
  }

  return '';
}

function extractTitleTag(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return '';
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

function isHtmlResponse(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes('text/html') || lower.includes('application/xhtml+xml');
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw new MetadataHttpError(422, 'response too large');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export function extractMetadataFromHtml(html: string, pageUrl: string): { title: string; thumbnailUrl: string } {
  const ogTitle = extractFirstMetaContent(html, 'property', 'og:title');
  const title = (ogTitle || extractTitleTag(html)).trim();

  const ogImage = extractFirstMetaContent(html, 'property', 'og:image') || extractFirstMetaContent(html, 'property', 'og:image:url');
  let thumbnailUrl = '';
  if (ogImage) {
    try {
      thumbnailUrl = new URL(ogImage, pageUrl).toString();
    } catch {
      thumbnailUrl = '';
    }
  }

  return { title, thumbnailUrl };
}

export async function fetchPageMetadata(rawUrl: string): Promise<{ title: string; thumbnailUrl: string }> {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    throw new MetadataHttpError(400, 'url is required');
  }

  throwUrlValidationError(validateHttpUrl(trimmedUrl, 'url'));

  let currentUrl = new URL(trimmedUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    assertSafeFetchTarget(currentUrl);
    await assertSafeResolvedFetchTarget(currentUrl);

    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'bookmark-metadata-bot/1.0',
        },
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new MetadataHttpError(504, 'upstream timeout');
      }
      throw new MetadataHttpError(502, 'failed to fetch upstream url');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new MetadataHttpError(502, 'upstream redirect missing location');
      }
      if (redirects === MAX_REDIRECTS) {
        throw new MetadataHttpError(502, 'too many redirects');
      }

      currentUrl = new URL(location, currentUrl);
      throwUrlValidationError(validateHttpUrl(currentUrl.toString(), 'url'));
      assertSafeFetchTarget(currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new MetadataHttpError(502, `upstream returned status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!isHtmlResponse(contentType)) {
      throw new MetadataHttpError(422, 'content-type must be text/html');
    }

    const contentLengthRaw = response.headers.get('content-length');
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new MetadataHttpError(422, 'response too large');
    }

    const html = await readLimitedText(response, MAX_RESPONSE_BYTES);
    return extractMetadataFromHtml(html, currentUrl.toString());
  }

  throw new MetadataHttpError(502, 'too many redirects');
}

export function mapMetadataError(error: unknown): { status: number; message: string } {
  if (error instanceof MetadataHttpError) {
    return { status: error.status, message: error.message };
  }
  return { status: 502, message: 'failed to fetch upstream url' };
}