#!/usr/bin/env python3
"""Draws the site icon, the hen's head in her space helmet, from one list of
shapes and writes it as public/favicon.svg plus PNGs for browsers and phones
that want bitmaps. Standard library only. Run it again after changing SHAPES:

    python3 scripts/make-icons.py

Ported from the syllable game's icon script. The colours are the hen's own,
from src/sprites.ts.
"""
import math
import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / 'public'

FEATHER = '#fdf4e3'
COMB = '#e8455f'
BEAK = '#f2a03c'
DARK = '#22283c'
GLASS = '#c4f0ff'

# All coordinates on a 64 x 64 canvas, y pointing down, angles in degrees
# clockwise from 3 o'clock (as in SVG). Later shapes paint over earlier ones.
SHAPES = [
    ('rrect', 0, 0, 64, 64, 14, '#141d3d', 1.0),           # night sky
    ('circle', 9, 12, 1.3, '#ffffff', 0.9),                 # stars
    ('circle', 7, 49, 1.0, '#ffffff', 0.6),
    ('circle', 57, 52, 1.2, '#ffffff', 0.8),
    ('circle', 32, 33, 23, '#aadcff', 0.18),                # helmet glass
    ('circle', 26.5, 21, 4.2, COMB, 1.0),                   # comb, three bumps
    ('circle', 32, 19, 4.8, COMB, 1.0),
    ('circle', 37.5, 21, 4.2, COMB, 1.0),
    ('circle', 32, 34, 13.5, FEATHER, 1.0),                 # head
    ('circle', 26.8, 32, 2.1, DARK, 1.0),                   # eyes
    ('circle', 37.2, 32, 2.1, DARK, 1.0),
    ('circle', 32, 46.2, 2.6, COMB, 1.0),                   # wattle
    ('poly', ((27, 37.5), (37, 37.5), (32, 45.5)), BEAK, 1.0),  # beak
    ('arc', 32, 33, 23, 2.6, 0, 360, GLASS, 0.95),          # helmet rim
    ('arc', 32, 33, 17.5, 2.6, 200, 245, '#ffffff', 0.8),   # glint
    ('line', 46.8, 15.4, 52, 8.5, 2.2, '#c9d6ec', 1.0),     # antenna
    ('circle', 52.8, 7.4, 3.0, '#ffd76a', 1.0),
    ('rrect', 19, 54, 45, 60, 3, '#c9d6ec', 1.0),           # collar seal
]


def svg() -> str:
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">']
    for s in SHAPES:
        kind = s[0]
        if kind == 'rrect':
            _, x0, y0, x1, y1, r, c, a = s
            out.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="{c}" fill-opacity="{a}"/>')
        elif kind == 'circle':
            _, cx, cy, r, c, a = s
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}" fill-opacity="{a}"/>')
        elif kind == 'poly':
            _, points, c, a = s
            out.append(f'<polygon points="{" ".join(f"{x},{y}" for x, y in points)}" fill="{c}" fill-opacity="{a}"/>')
        elif kind == 'line':
            _, x0, y0, x1, y1, w, c, a = s
            out.append(f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="{c}" stroke-opacity="{a}" stroke-width="{w}" stroke-linecap="round"/>')
        elif kind == 'arc':
            _, cx, cy, r, w, a0, a1, c, a = s
            if a1 - a0 >= 360:
                out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{c}" stroke-opacity="{a}" stroke-width="{w}"/>')
                continue
            p0 = (cx + r * math.cos(math.radians(a0)), cy + r * math.sin(math.radians(a0)))
            p1 = (cx + r * math.cos(math.radians(a1)), cy + r * math.sin(math.radians(a1)))
            large = 1 if a1 - a0 > 180 else 0
            out.append(
                f'<path d="M{p0[0]:.2f} {p0[1]:.2f} A{r} {r} 0 {large} 1 {p1[0]:.2f} {p1[1]:.2f}" fill="none" '
                f'stroke="{c}" stroke-opacity="{a}" stroke-width="{w}" stroke-linecap="round"/>'
            )
    out.append('</svg>')
    return '\n'.join(out) + '\n'


def covers(shape, x: float, y: float) -> bool:
    kind = shape[0]
    if kind == 'rrect':
        _, x0, y0, x1, y1, r = shape[:6]
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        dx = max(x0 + r - x, 0, x - (x1 - r))
        dy = max(y0 + r - y, 0, y - (y1 - r))
        return dx * dx + dy * dy <= r * r
    if kind == 'circle':
        _, cx, cy, r = shape[:4]
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if kind == 'poly':
        # Even-odd ray casting.
        points = shape[1]
        inside = False
        for (xa, ya), (xb, yb) in zip(points, points[1:] + points[:1]):
            if (ya > y) != (yb > y) and x < xa + (y - ya) * (xb - xa) / (yb - ya):
                inside = not inside
        return inside
    if kind == 'line':
        _, x0, y0, x1, y1, w = shape[:6]
        vx, vy = x1 - x0, y1 - y0
        t = max(0.0, min(1.0, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
        return (x - x0 - t * vx) ** 2 + (y - y0 - t * vy) ** 2 <= (w / 2) ** 2
    if kind == 'arc':
        _, cx, cy, r, w, a0, a1 = shape[:7]
        d = math.hypot(x - cx, y - cy)
        if abs(d - r) > w / 2:
            # Round caps at the ends of a partial arc.
            if a1 - a0 >= 360:
                return False
            for a in (a0, a1):
                ex, ey = cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))
                if (x - ex) ** 2 + (y - ey) ** 2 <= (w / 2) ** 2:
                    return True
            return False
        if a1 - a0 >= 360:
            return True
        angle = math.degrees(math.atan2(y - cy, x - cx)) % 360
        return (angle - a0) % 360 <= (a1 - a0)
    raise ValueError(kind)


def rgb(hex_color: str):
    return tuple(int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))


def raster(size: int, ss: int = 4) -> bytes:
    """RGBA pixels, `ss` x `ss` samples per pixel for smooth edges."""
    scale = 64 / size
    rows = bytearray()
    for py in range(size):
        rows.append(0)  # PNG filter: none
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]  # premultiplied
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) * scale
                    y = (py + (sy + 0.5) / ss) * scale
                    r = g = b = a = 0.0
                    for shape in SHAPES:
                        if covers(shape, x, y):
                            cr, cg, cb = rgb(shape[-2])
                            sa = shape[-1]
                            r = cr * sa + r * (1 - sa)
                            g = cg * sa + g * (1 - sa)
                            b = cb * sa + b * (1 - sa)
                            a = sa + a * (1 - sa)
                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += a
            n = ss * ss
            alpha = acc[3] / n
            if alpha > 0:
                rows += bytes(round(min(1, c / n / alpha) * 255) for c in acc[:3])
            else:
                rows += b'\0\0\0'
            rows.append(round(alpha * 255))
    return bytes(rows)


def png(size: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raster(size), 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    PUBLIC.mkdir(exist_ok=True)
    (PUBLIC / 'favicon.svg').write_text(svg())
    for size, name in ((32, 'favicon-32.png'), (180, 'apple-touch-icon.png')):
        (PUBLIC / name).write_bytes(png(size))
    print('wrote favicon.svg, favicon-32.png, apple-touch-icon.png to', PUBLIC)
