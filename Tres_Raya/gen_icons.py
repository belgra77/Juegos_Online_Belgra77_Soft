#!/usr/bin/env python3
"""
Genera los iconos PWA de "Tres en Raya online by Belgra_77_Soft".
Dibujo: tablero 3x3 con una ✕ celeste y una ⭕ rosa sobre fondo slate-950.
Codificación PNG manual (RGBA, zlib + crc) — sin dependencias externas.
Uso:  python3 gen_icons.py
"""
import struct, zlib, math, os

def png_write(path, w, h, pixels):
    """pixels: lista de filas, cada fila lista de (r,g,b,a)"""
    raw = b""
    for row in pixels:
        raw += b"\x00" + b"".join(bytes(p) for p in row)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # RGBA 8-bit
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)

def clamp(v): return max(0, min(255, int(round(v))))

def blend(base, color, alpha):
    return tuple(clamp(base[i] * (1 - alpha) + color[i] * alpha) for i in range(3)) + (255,)

def anti_alias(fn):
    """Decorador: suaviza bordes muestreando 2x2."""
    def draw(px, cx, cy, size, **kw):
        return fn(px, cx, cy, size, **kw)
    return draw

class Canvas:
    def __init__(self, size, bg=(2, 6, 23)):  # slate-950
        self.s = size
        self.px = [[list(bg) + [255] for _ in range(size)] for _ in range(size)]
        self.base = bg
    def put(self, x, y, color, a):
        if 0 <= x < self.s and 0 <= y < self.s:
            self.px[y][x] = blend(self.px[y][x][:3], color, a)
    def shade(self, x, y, color, a):
        """Pinta un suministro AA de 2x2 suavizando el borde."""
        for dx in (0.0, 0.5):
            for dy in (0.0, 0.5):
                self.put(int(x + dx), int(y + dy), color, a / 4)
    def line(self, x0, y0, x1, y1, w, color):
        """Línea gruesa con muestreo AA."""
        length = math.hypot(x1 - x0, y1 - y0)
        steps = max(2, int(length * 4))
        for i in range(steps + 1):
            t = i / steps
            cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            r = w / 2
            for yy in range(int(cy - r - 1), int(cy + r + 2)):
                for xx in range(int(cx - r - 1), int(cx + r + 2)):
                    d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
                    if d <= r: self.put(xx, yy, color, 0.85)
                    elif d <= r + 0.8: self.shade(xx, yy, color, (r + 0.8 - d) * 0.5)
    def ring(self, cx, cy, r, w, color):
        """Círculo (anillo) con AA radial."""
        for yy in range(int(cy - r - 1), int(cy + r + 2)):
            for xx in range(int(cx - r - 1), int(cx + r + 2)):
                d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
                if abs(d - r) <= w / 2:
                    edge = min(1.0, (w / 2 - abs(d - r) + 0.4))
                    self.put(xx, yy, color, 0.9 * min(1, edge))
    def glow(self, cx, cy, r, color):
        for yy in range(int(cy - r), int(cy + r)):
            for xx in range(int(cx - r), int(cx + r)):
                d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
                if d < r:
                    a = (1 - d / r) ** 2 * 0.35
                    self.shade(xx, yy, color, a)

CYAN = (56, 189, 248)   # ✕  sky-400
PINK = (244, 114, 182)  # ⭕ pink-400
GRID = (148, 163, 184)  # slate-400

def draw_icon(size, maskable=False):
    c = Canvas(size)
    # Radio de esquinas redondeadas (any) — maskable ocupa todo el lienzo
    if not maskable:
        r = size * 0.22
        for y in range(size):
            for x in range(size):
                nx = min(x, size - 1 - x); ny = min(y, size - 1 - y)
                if nx < r and ny < r and math.hypot(r - nx - 0.5, r - ny - 0.5) > r:
                    c.put(x, y, (10, 15, 30), 1.0)
    s = size
    brillo = CYAN if size == 192 else CYAN
    # Resplandores decorativos
    c.glow(s * 0.2, s * 0.15, s * 0.45, (14, 165, 233))
    c.glow(s * 0.85, s * 0.9, s * 0.4, (139, 92, 246))
    # Zona jugable (safe zone para maskable: 80 % centrado)
    mar = 0.14 if maskable else 0.17
    L, R = s * mar, s * (1 - mar)
    t = (R - L) / 3
    tw = s * 0.022  # grosor líneas del tablero
    for i in (1, 2):
        c.line(L + t * i, L, L + t * i, R, tw, GRID)
        c.line(L, L + t * i, R, L + t * i, tw, GRID)
    # ✕ en celda superior-izquierda
    cell = t * 0.28
    cxm, cym = L + t * 0.5, L + t * 0.5
    xw = s * 0.032
    c.line(cxm - cell, cym - cell, cxm + cell, cym + cell, xw, CYAN)
    c.line(cxm + cell, cym - cell, cxm - cell, cym + cell, xw, CYAN)
    c.glow(cxm, cym, t * 0.55, CYAN)
    # ⭕ en celda inferior-derecha
    cym2 = L + t * 2.5
    cxm2 = L + t * 2.5
    c.ring(cxm2, cym2, t * 0.28, s * 0.035, PINK)
    c.glow(cxm2, cym2, t * 0.55, PINK)
    return c

os.makedirs("icons", exist_ok=True)
for name, size, maskable in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icons/icon-maskable-512.png", 512, True)]:
    canvas = draw_icon(size, maskable)
    png_write(os.path.join("icons", os.path.basename(name)), size, size, canvas.px)
    print("OK", name, size)
