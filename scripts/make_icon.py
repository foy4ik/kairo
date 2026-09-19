"""Generates the Kairo app icon (1024x1024 PNG) with supersampling."""
from PIL import Image, ImageDraw

S = 1024 * 2
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
r = int(S * 0.225)
# gradient background
bg = Image.new("RGBA", (S, S))
px = bg.load()
c1, c2 = (99, 102, 241), (139, 92, 246)
for y in range(S):
    for x in range(0, S, 1):
        t = (x + y) / (2 * S)
        px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], r, fill=255)
img.paste(bg, (0, 0), mask)
w = int(S * 0.115)
white = (255, 255, 255, 255)
x0, top, bot = int(S * 0.31), int(S * 0.24), int(S * 0.76)
mid = (top + bot) // 2
d.rounded_rectangle([x0, top, x0 + w, bot], w // 2, fill=white)
def stroke(p1, p2):
    d.line([p1, p2], fill=white, width=w)
    for p in (p1, p2):
        d.ellipse([p[0] - w // 2, p[1] - w // 2, p[0] + w // 2, p[1] + w // 2], fill=white)
stroke((x0 + w // 2, mid + int(S * 0.02)), (int(S * 0.70), top + w // 2))
stroke((x0 + int(w * 0.9), mid - int(S * 0.005)), (int(S * 0.71), bot - w // 2))
img = img.resize((1024, 1024), Image.LANCZOS)
img.save("scripts/icon-source.png")
