// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import contributors from "../data/contributors.json";

const ext: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

export type Person = { login: string; avatar: string; file: string | null; type?: string; body?: Buffer };

let loaded: Promise<Person[]> | undefined;

// avatars downloads each contributor's avatar once per build, for the
// community page and the files under /avatars/ alike. One that won't
// download, or isn't an image type we serve, has no file, and the page
// shows the handle's initial.
export function avatars(): Promise<Person[]> {
  loaded ??= Promise.all(
    contributors.map(async (p): Promise<Person> => {
      try {
        const res = await fetch(`${p.avatar}${p.avatar.includes("?") ? "&" : "?"}s=96`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(String(res.status));
        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!ext[type]) throw new Error(`type ${type}`);
        return { ...p, file: `${p.login.toLowerCase()}.${ext[type]}`, type, body: Buffer.from(await res.arrayBuffer()) };
      } catch {
        return { ...p, file: null };
      }
    }),
  );
  return loaded;
}
