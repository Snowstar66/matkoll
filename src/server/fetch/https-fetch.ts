import "server-only";
import type { LookupAddress, LookupOptions } from "node:dns";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { pipeline, Readable, type Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { FetchImpl, Lookup } from "./safe-fetch";

// safeFetch's default request (AD-11): one HTTPS GET with node:https, no
// redirects followed. The checked lookup is node's `lookup` option, so it runs
// inside the connection: the socket connects to exactly the address that
// passed the check, and TLS still verifies the certificate against the host
// name. No connection pool (`agent: false`), so a socket is never reused for
// another host. A compressed body is decompressed here; safeFetch counts the
// decompressed bytes against its limit, so a small compressed body cannot
// grow without bound.

type NodeLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Adapts a Lookup to node's callback style, with and without `all` (happy eyeballs asks for all). */
export function toNodeLookup(lookup: Lookup) {
  return (hostname: string, options: LookupOptions, callback: NodeLookupCallback) => {
    const wanted = options.family === 4 || options.family === "IPv4" ? 4 : options.family === 6 || options.family === "IPv6" ? 6 : 0;
    lookup(hostname).then(
      (addresses) => {
        const usable = wanted ? addresses.filter(({ family }) => family === wanted) : addresses;
        if (usable.length === 0) {
          callback(Object.assign(new Error("No usable address"), { code: "ENOTFOUND" }), "", 4);
        } else if (options.all) {
          callback(null, usable.map(({ address, family }) => ({ address, family })));
        } else {
          callback(null, usable[0].address, usable[0].family);
        }
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error("lookup failed"), "", 4),
    );
  };
}

function decoderFor(encoding: string | undefined): Transform | null | "unsupported" {
  switch (encoding?.trim().toLowerCase()) {
    case undefined:
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return "unsupported";
  }
}

/**
 * A web Response for node's response: the headers copied, no body for 204,
 * 205 and 304, and a compressed body decompressed (gzip, deflate, br) with
 * Content-Encoding and Content-Length removed. Throws, after destroying the
 * response, for a status outside 200–599 or an encoding it cannot read;
 * safeFetch turns that into fetch_blocked.
 */
export function toFetchResponse(res: IncomingMessage): Response {
  const status = res.statusCode ?? 0;
  if (status < 200 || status > 599) {
    res.destroy();
    throw new Error(`Unexpected status ${status}`);
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }

  if ([204, 205, 304].includes(status)) {
    res.resume();
    return new Response(null, { status, headers });
  }

  const decoder = decoderFor(res.headers["content-encoding"]);
  if (decoder === "unsupported") {
    res.destroy();
    throw new Error("Unsupported content encoding");
  }
  let body: Readable = res;
  if (decoder) {
    body = pipeline(res, decoder, () => {});
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, { status, headers });
}

export const httpsFetch: FetchImpl = (url, { signal, headers, lookup }) =>
  new Promise<Response>((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { ...headers, "accept-encoding": "gzip, deflate, br" },
        agent: false,
        servername: url.hostname,
        lookup: toNodeLookup(lookup),
        signal,
      },
      (res) => {
        // Nothing thrown here may escape the promise.
        try {
          resolve(toFetchResponse(res));
        } catch (error) {
          res.destroy();
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
