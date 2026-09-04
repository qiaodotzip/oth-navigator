/**
 * End-to-end check of the Blender round trip against a running server:
 * export context -> treat it as a modeller's upload -> place it -> publish.
 */
import { parseModel } from "@oth/model";
import { buildContextGlb } from "@oth/renderer";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const EMAIL = process.argv[2]!;
const PASSWORD = process.argv[3]!;

let cookie = "";

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  return res;
}

const login = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
console.log("login:", login.status);

const model = parseModel(await (await call("/api/model")).json());
const level = model.levels.find(l => l.code === "L1")!;
const rooms = model.rooms.filter(r => r.levelId === level.id);
console.log(`model: ${model.rooms.length} rooms, exporting ${rooms.length} on ${level.code}`);

const glb = await buildContextGlb(rooms, level);
await writeFile("scripts/.context.glb", glb);
console.log("context export:", glb.byteLength, "bytes");

// A modeller would edit this and upload their own mesh; uploading the context
// itself is enough to prove the ingest path end to end.
const form = new FormData();
form.append("file", new Blob([glb as BlobPart]), "l1-detail.glb");
const upload = await call("/api/assets", { method: "POST", body: form });
const uploaded = await upload.json();
console.log("upload:", upload.status, uploaded.asset?.id, uploaded.asset?.triangleCount, "tris");

const place = await call("/api/entities/placement", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    data: {
      id: `${level.id}-place-roundtrip`,
      levelId: level.id,
      assetId: uploaded.asset.id,
      roomId: rooms[0]!.id,
      position: [5, 5, 0],
      rotationDeg: 90,
      scale: 1,
    },
  }),
});
console.log("placement:", place.status);

const published = await call("/api/publish", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ notes: "round-trip check" }),
});
const result = await published.json();
console.log("publish:", published.status, result.version ?? JSON.stringify(result).slice(0, 200));
