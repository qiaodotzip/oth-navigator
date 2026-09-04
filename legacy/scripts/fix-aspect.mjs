// One-shot: re-scale all Y coordinates to remove the aspect-ratio distortion.
// Image is 3000x2121; keeping width=210 m, uniform scale 0.07 m/px gives
// depth = 2121 * 0.07 = 148.47 m. Old Y used 130/2121 m/px, so multiply by
// (148.47/130) = 1.14208 to make X and Y share the same scale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const NEW_DEPTH = Math.round((2121 * (210 / 3000)) * 100) / 100; // 148.47
const SY = NEW_DEPTH / 130; // 1.14208...
const round = n => Math.round(n * 100) / 100;
const readJson = path => JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));

function fixFloor(path) {
  if (!existsSync(path)) return;
  const j = readJson(path);
  j.bounds.depth = NEW_DEPTH;
  for (const poly of j.polygons) {
    poly.points = poly.points.map(([x, y]) => [x, round(y * SY)]);
  }
  writeFileSync(path, JSON.stringify(j, null, 2));
  console.log(`fixed ${path}: ${j.polygons.length} polygons, depth=${NEW_DEPTH}`);
}

function fixWaypoints(path) {
  if (!existsSync(path)) return;
  const routes = readJson(path);
  for (const r of routes) {
    for (const step of r.steps) {
      step.point = [step.point[0], round(step.point[1] * SY)];
    }
  }
  writeFileSync(path, JSON.stringify(routes, null, 2));
  console.log(`fixed ${path}: ${routes.length} routes`);
}

fixFloor("public/data/floors/L1.json");
fixFloor("public/data/floors/L2.json");
fixWaypoints("public/data/waypoints.json");
console.log(`\nScale factor SY = ${SY.toFixed(5)} — apply same to wanderLoops.ts and TOWN_SQUARE_M`);
console.log(`Town Square Y: 73 -> ${round(73 * SY)}`);
console.log(`Wander loop Ys: 73->${round(73 * SY)}, 53->${round(53 * SY)}, 38->${round(38 * SY)}, 57->${round(57 * SY)}, 84->${round(84 * SY)}, 41->${round(41 * SY)}, 37->${round(37 * SY)}, 79->${round(79 * SY)}, 97->${round(97 * SY)}, 95->${round(95 * SY)}`);
