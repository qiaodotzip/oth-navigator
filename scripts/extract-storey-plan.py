"""Pull room footprints out of the architect's storey plan.

    python scripts/extract-storey-plan.py "docs/1st Level - Floor Plan.pdf" \
        packages/server/src/cli/data/l1-spaces.json [--underlay images/x.jpg]

The plan is a vector CAD export: the walls are exact and the spaces are named,
but nothing in the file says which lines enclose which name. This joins the
two — flood outward from each printed label until you meet a line the
architect drew — so the footprints are the building's own geometry rather than
anybody's tracing of it.

Needs PyMuPDF, numpy and Pillow. It is run by hand when a new sheet arrives,
not by the build: the output is committed, so the server has no Python in it.

Three things it does that are worth knowing about:

* **Scale comes from the drawing's own dimensions**, never from the printed
  scale ratio. The sheet says "SCALE 1 : 500" and is wrong by 4.25x, because
  that ratio belongs to the original A0 and this PDF is a reduction of it. The
  9 m structural grid is dimensioned along two perpendicular runs; summing
  each run gives the metres per point, and the two agree to 0.004%.

* **The lettering is erased before flooding.** Text is not architecture, and
  left in place it walls a label off from its own room.

* **Doorways are pinched shut first.** Flooding the plan as drawn runs from a
  changing room through its door, down the hallway and into the next twelve
  rooms. Eroding the open space by half a metre closes every opening narrower
  than a metre; the flood then stays put, and dilating the result back puts
  the walls where they belong. A space too narrow to survive the erosion is a
  riser or a shaft and is taken whole instead.

A label whose flood escapes even with the doorways shut is not a room: it is a
plaza or a walkway, which this drawing never closes. Those are reported and
left out rather than guessed at.
"""
import argparse
import json
import re
from collections import Counter, deque

import numpy as np
import pymupdf
from PIL import Image, ImageDraw

# ---------------------------------------------------------------- calibration

GRID_MM = re.compile(r"^\d{3,5}$")


def calibrate(page):
    """Metres per PDF point, from the sheet's own dimension strings.

    A dimension is printed centred in the bay it measures, so the gap between
    two adjacent ones is the mean of the two bays. Individual gaps wander with
    the text placement; the sum over a whole run does not.
    """
    words = [(w[4], (w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in page.get_text("words")]
    dims = [(t, x, y) for t, x, y in words if GRID_MM.fullmatch(t)]
    runs = []
    for axis in (0, 1):
        key = (lambda r: r[1]) if axis == 0 else (lambda r: r[2])
        other = (lambda r: r[2]) if axis == 0 else (lambda r: r[1])
        # A dimension run is a line of them sharing the other coordinate.
        lanes = Counter(round(other(d), 0) for d in dims)
        for lane, n in lanes.items():
            if n < 8:
                continue
            row = sorted((d for d in dims if abs(other(d) - lane) < 6), key=key)
            mm = pt = 0.0
            for a, b in zip(row, row[1:]):
                gap = key(b) - key(a)
                span = (int(a[0]) + int(b[0])) / 2
                if gap <= 0 or not (0.5 < gap / span * 1000 < 2.0):
                    continue
                mm += span
                pt += gap
            if pt > 50:
                runs.append((mm, pt))
    if len(runs) < 3:
        raise SystemExit("could not find enough dimension runs to calibrate from")
    # Not every run of numbers on a sheet is a run of adjacent bays: a string
    # with a dimension missing from the middle reads as one long bay and comes
    # out several percent wide. The agreeing majority is the sheet's scale, so
    # take the median and throw out anything that wanders from it.
    each = sorted(mm / pt for mm, pt in runs)
    med = each[len(each) // 2]
    keep = [(mm, pt) for mm, pt in runs if abs(mm / pt - med) / med < 0.005]
    if len(keep) < 2:
        raise SystemExit(f"dimension runs disagree: {[round(e, 1) for e in each]}")
    scale = sum(mm for mm, _ in keep) / sum(pt for _, pt in keep) / 1000
    spread = max(abs(mm / pt / 1000 - scale) for mm, pt in keep) / scale
    print(f"calibration: {len(keep)}/{len(runs)} dimension runs agree to {spread:.4%}")
    return scale


# ------------------------------------------------------------------- geometry


def shift_or(a, r):
    out = a.copy()
    for d in range(1, r + 1):
        out[d:, :] |= a[:-d, :]
        out[:-d, :] |= a[d:, :]
        out[:, d:] |= a[:, :-d]
        out[:, :-d] |= a[:, d:]
    return out


def dilate(a, r):
    return shift_or(a, r)


def erode(a, r):
    return ~shift_or(~a, r)


def loops(mask):
    """Every closed boundary of `mask`, walked clockwise in image coords.

    Follows the cracks between pixels rather than the pixels, so a vertex
    lands on the wall line itself instead of a staircase half a pixel off it.
    """
    m = np.pad(mask, 1)
    edges = {}

    def add(a, b):
        edges.setdefault(a, []).append(b)

    for y, x in zip(*np.nonzero(m & ~np.roll(m, 1, 0))):
        add((x, y), (x + 1, y))
    for y, x in zip(*np.nonzero(m & ~np.roll(m, -1, 1))):
        add((x + 1, y), (x + 1, y + 1))
    for y, x in zip(*np.nonzero(m & ~np.roll(m, -1, 0))):
        add((x + 1, y + 1), (x, y + 1))
    for y, x in zip(*np.nonzero(m & ~np.roll(m, 1, 1))):
        add((x, y + 1), (x, y))

    out = []
    while edges:
        start = cur = next(iter(edges))
        ring = [start]
        while True:
            nxts = edges.get(cur)
            if not nxts:
                break
            nxt = nxts.pop()
            if not nxts:
                del edges[cur]
            cur = nxt
            if cur == start:
                break
            ring.append(cur)
        if len(ring) >= 4:
            out.append(ring)
    return out


def drop_collinear(ring):
    out = []
    n = len(ring)
    for i, p in enumerate(ring):
        a, b = ring[i - 1], ring[(i + 1) % n]
        if (p[0] - a[0]) * (b[1] - p[1]) != (p[1] - a[1]) * (b[0] - p[0]):
            out.append(p)
    return out or ring


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    den = (dx * dx + dy * dy) ** 0.5
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = (abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / den) if den else 0.0
        if d > best:
            best, bi = d, i
    if best <= eps:
        return [a, b]
    return rdp(pts[:bi + 1], eps)[:-1] + rdp(pts[bi:], eps)


def clean(mask, mpp, spur_m=0.30, notch_m=0.30):
    """Drop what is not the room: door swings, fixtures, the gap a cleared
    label left in a wall. Opening removes thin spurs, closing fills notches."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return mask
    pad = int(max(spur_m, notch_m) / mpp) + 4
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, mask.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, mask.shape[1])
    sub = mask[y0:y1, x0:x1]
    rs, rn = int(spur_m / mpp), int(notch_m / mpp)
    sub = erode(dilate(dilate(erode(sub, rs), rs), rn), rn)
    out = np.zeros_like(mask)
    out[y0:y1, x0:x1] = sub
    return out


# --------------------------------------------------------------------- naming

ROOMY = {
    "STALL", "RESTAURANT", "KITCHEN", "SHOP", "TOILET", "CORRIDOR", "STORAGE",
    "STORE", "ROOM", "STUDIO", "CHANGING", "LOUNGE", "CONCESSION", "REFEREE",
    "TUNNEL", "HALLWAY", "SEATING", "LOBBY", "SHOWER", "KIOSK", "PLAZA",
    "WALKWAY", "FIELD", "POOL", "RECREATIONAL", "TERRACE", "LIBRARY",
    "THEATRE", "GALLERY", "HALL", "OFFICE", "NURSING", "FAMILY", "SECURITY",
    "CARETAKER", "CLEANER", "AID", "SERVER", "CHAMBER", "REFUSE", "TRAY",
    "WASH", "TAXI", "DECK", "VOID", "ESCALATOR", "PANTRY", "CENTRE", "AREA",
    "COMMAND", "LAN", "MDF", "AHU", "SWITCH", "CHEMICAL", "SPRINKLER",
    "FIRST", "MEDIA", "VIP", "TEAM", "PLAYER'S", "MULTI", "FITNESS",
    "COMMUNITY", "DANCE", "HOCKEY", "TENNIS", "FUTSAL", "SWIMMING", "STADIUM",
}
SERVICE_WORDS = {
    "STORAGE", "STORE", "LAN", "MDF", "AHU", "SWITCH", "CHAMBER", "SHAFT",
    "RISER", "REFUSE", "PUMP", "WASH", "TRAY", "CLEANER", "ELEC", "CHEMICAL",
    "SPRINKLER", "COMMAND", "SECURITY", "SERVER", "CARETAKER", "CHUTE",
}
AREA_WORDS = {"CORRIDOR", "HALLWAY", "LOBBY", "TUNNEL", "RECREATIONAL",
              "CONCOURSE", "SEATING", "PLAZA", "WALKWAY"}
# Named as open, and the drawing never closes it. Both tests must pass.
OPEN_WORDS = {"PLAZA", "WALK", "WALKWAY", "FIELD", "DECK", "TAXI", "SEATING",
              "ARRIVAL", "EVENT", "POOL"}

NOT_A_NAME = re.compile(
    r"^(FFL|SFL|SLL|CLL|RL|FALL|GRADIENT|RWDP|LINE OF|DOUBLE SLAB|MIN HEADROOM|"
    r"BOUNDARY|BASEMENT|ROOF LINE|UP TO|UP FROM|RAMP UP|STEP UP|SHUTTER GATE|"
    r"OPERABLE|TO \+)", re.I)
LEVEL_NOTE = re.compile(r"\b(?:FFL|SFL|SLL|CLL|RL)\b\s*[+-]?[\d.,]*", re.I)
SERVICE_CODE = re.compile(
    r"\b(?:WTR|SAN|TEL|ELV|FAD|EAD|KEAD|KFAD|RWDP|IEP|MV|BI|SCV|VRF|HR|DR|FU)\b")
JUNK_NAME = re.compile(r"^(Void|Field|Slab Above|Step Up|Shutter|Ramp|Fall)\b", re.I)
FIXUPS = {"Hcp": "HCP", "Vip": "VIP", "Ahu": "AHU", "Lan": "LAN", "Mdf": "MDF",
          "Fm": "FM", "Sppg": "SPPG", "Ht": "HT"}


def words_of(text):
    return set(re.findall(r"[A-Z']{2,}", text.upper()))


def tidy(text):
    t = re.sub(r"\s*\((?:SSC|CC)\)", "", text)
    t = SERVICE_CODE.sub(" ", LEVEL_NOTE.sub(" ", t))
    t = re.sub(r"\s+", " ", t).strip(" -|/,").title()
    for a, b in FIXUPS.items():
        t = re.sub(rf"\b{a}\b", b, t)
    return t


def classify(text):
    w = words_of(text)
    if w & SERVICE_WORDS:
        return "service"
    if w & AREA_WORDS:
        return "area"
    return "room"


def slug(name, taken, prefix):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "space"
    out = base = f"{prefix}-{s}"
    i = 1
    while out in taken:
        i += 1
        out = f"{base}-{i}"
    taken.add(out)
    return out


def labels(page, mpp, ox, oy):
    """Printed labels, grouped back into the multi-line names they were."""
    lines = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            txt = " ".join(s["text"] for s in l["spans"]).strip()
            # A floor level is printed under half the names on the sheet. It
            # is not part of the name, and it breaks the grouping below.
            if not txt or re.match(r"^(FFL|SFL|SLL|CLL|RL)\b|^[+-]?[\d.,]+$", txt, re.I):
                continue
            x0, y0, x1, y1 = l["bbox"]
            lines.append({"text": txt, "bbox": l["bbox"],
                          "x": (ox - (y0 + y1) / 2) * mpp,
                          "y": (oy - (x0 + x1) / 2) * mpp})
    lines.sort(key=lambda l: (-l["x"], -l["y"]))
    used = [False] * len(lines)
    out = []
    for i, l in enumerate(lines):
        if used[i]:
            continue
        group = [l]
        used[i] = True
        for j in range(i + 1, len(lines)):
            if used[j]:
                continue
            m = lines[j]
            if abs(m["x"] - group[-1]["x"]) < 1.2 and 0 < group[-1]["y"] - m["y"] < 2.0:
                group.append(m)
                used[j] = True
        out.append({"text": re.sub(r"\s+", " ", " ".join(g["text"] for g in group)).strip(),
                    "x": sum(g["x"] for g in group) / len(group),
                    "y": sum(g["y"] for g in group) / len(group)})
    return out, lines


# ----------------------------------------------------------------------- main


def nearest(ok, sx, sy, reach=40):
    h, w = ok.shape
    if ok[sy, sx]:
        return sx, sy
    for r in range(1, reach):
        y0, y1 = max(sy - r, 0), min(sy + r + 1, h)
        x0, x1 = max(sx - r, 0), min(sx + r + 1, w)
        blk = ok[y0:y1, x0:x1]
        if blk.any():
            ys, xs = np.nonzero(blk)
            k = int(np.argmin((ys + y0 - sy) ** 2 + (xs + x0 - sx) ** 2))
            return int(xs[k] + x0), int(ys[k] + y0)
    return None


def flood(img, seed):
    im = img.copy()
    ImageDraw.floodfill(im, seed, 128)
    return np.asarray(im) == 128


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--level-id", default="oth-L1")
    ap.add_argument("--prefix", default="L1")
    ap.add_argument("--origin", nargs=2, type=float, default=[628.03, 489.39],
                    help="model origin in unrotated PDF points; see planL1.ts")
    ap.add_argument("--window", nargs=4, type=float, default=[-20.0, 300.0, 300.0, 290.0],
                    help="model x0 y0 width height, metres")
    ap.add_argument("--mpp", type=float, default=0.05, help="raster metres per pixel")
    ap.add_argument("--pinch", type=float, default=0.50, help="doorway pinch, metres")
    ap.add_argument("--underlay", help="also write a registered raster here")
    ap.add_argument("--underlay-mpp", type=float, default=0.07)
    args = ap.parse_args()

    doc = pymupdf.open(args.pdf)
    page = doc[0]
    page.set_rotation(0)
    S = calibrate(page)
    ox, oy = args.origin
    mx0, my0, wm, hm = args.window
    print(f"scale: {S * 1000:.3f} mm per point ({S:.6f} m/pt)")

    def render(mpp, x0, y0, w, h):
        clip = pymupdf.Rect(792 - ox + x0 / S, oy - y0 / S,
                            792 - ox + (x0 + w) / S, oy - (y0 - h) / S)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(S / mpp, S / mpp), clip=clip)
        return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)

    if args.underlay:
        a = render(args.underlay_mpp, mx0, my0, wm, hm)
        Image.fromarray(a[:, :, :3]).save(args.underlay, quality=88,
                                          subsampling=0, optimize=True)
        print(f"underlay: {args.underlay} at {args.underlay_mpp} m/px, "
              f"offset {mx0} {my0}")

    grey = render(args.mpp, mx0, my0, wm, hm)[:, :, 0]
    ink = grey < 170
    mpp = args.mpp
    H, W = ink.shape

    def to_px(mx, my):
        return int(round((mx - mx0) / mpp)), int(round((my0 - my) / mpp))

    groups, lines = labels(page, S, ox, oy)
    pad = 0.35
    for l in lines:
        x0, y0, x1, y1 = l["bbox"]
        a, b = to_px((ox - y1) * S - pad, (oy - x0) * S + pad)
        c, d = to_px((ox - y0) * S + pad, (oy - x1) * S - pad)
        ink[max(b, 0):min(d, H), max(a, 0):min(c, W)] = False
    print(f"labels: {len(groups)} names, {len(lines)} lines of text erased")

    free = ~ink
    R = int(args.pinch / mpp)
    tight = erode(free, R)
    free_img = Image.fromarray(np.where(ink, 255, 0).astype(np.uint8))
    tight_img = Image.fromarray(np.where(tight, 0, 255).astype(np.uint8))

    rows, seen, taken = [], {}, set()
    open_spaces = []
    for lab in groups:
        if NOT_A_NAME.match(lab["text"]) or not (words_of(lab["text"]) & ROOMY):
            continue
        sx, sy = to_px(lab["x"], lab["y"])
        if not (0 <= sx < W and 0 <= sy < H):
            continue
        if words_of(lab["text"]) & OPEN_WORDS:
            loose = nearest(free, sx, sy)
            if loose and flood(free_img, loose).sum() * mpp * mpp > 2500:
                open_spaces.append(lab["text"])
                continue
        seed = nearest(tight, sx, sy)
        if seed is not None:
            mask = dilate(flood(tight_img, seed), R) & free
        else:
            seed = nearest(free, sx, sy)
            if seed is None:
                continue
            mask = flood(free_img, seed)

        area = float(mask.sum()) * mpp * mpp
        if not 3 <= area <= 2500:
            continue
        ys, xs = np.nonzero(mask)
        key = (int(mask.sum()), int(ys[0]), int(xs[0]))
        if key in seen:
            seen[key]["labels"].append(lab["text"])
            continue

        rings = loops(clean(mask, mpp))
        if not rings:
            continue
        rings.sort(key=len, reverse=True)

        def poly(r):
            r = drop_collinear(r)
            c = rdp(r + [r[0]], 0.4 / mpp)[:-1]
            return [[round(mx0 + (x - 1) * mpp, 2), round(my0 - (y - 1) * mpp, 2)]
                    for x, y in c] if len(c) >= 3 else None

        outer = poly(rings[0])
        if not outer:
            continue
        holes = []
        for r in rings[1:]:
            xs2 = [p[0] for p in r]
            ys2 = [p[1] for p in r]
            if (max(xs2) - min(xs2)) * (max(ys2) - min(ys2)) * mpp * mpp < 6:
                continue
            h = poly(r)
            if h:
                holes.append(h)
        row = {"labels": [lab["text"]], "areaM2": round(area, 1),
               "footprint": outer, "holes": holes}
        seen[key] = row
        rows.append(row)

    spaces = []
    for row in rows:
        names = sorted((n for n in map(tidy, row["labels"]) if n),
                       key=lambda n: (-len(n), n))
        if not names or JUNK_NAME.match(names[0]):
            continue
        spaces.append({"id": slug(names[0], taken, args.prefix), "nameEn": names[0],
                       "kind": classify(names[0]), "areaM2": row["areaM2"],
                       "footprint": row["footprint"], "holes": row["holes"]})
    spaces.sort(key=lambda s: -s["areaM2"])
    json.dump({"levelId": args.level_id, "spaces": spaces}, open(args.out, "w"), indent=1)
    print(f"spaces: {len(spaces)}  {Counter(s['kind'] for s in spaces)}")
    print(f"open, left out: {len(open_spaces)} {sorted(set(open_spaces))}")


if __name__ == "__main__":
    main()
