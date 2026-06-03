"""Generate the solid pure-green marker image for the colour-detection AR backend
(GreenBlobSession). Show this full-screen on a second phone and point it at the
camera — the cat seats itself on the detected green region.

Pure solid green (#00D800), matching the in-app hint swatch and well inside the
detector's threshold (g≥70, g≥r·1.25, g≥b·1.25, g−min(r,b)≥35). Portrait phone
aspect so it fills a typical screen with no letterbox. A thin dark border helps
the eye frame it and keeps it readable as one block; it does not affect detection.

Run (from ar/):  python dev/make-green.py   →  public/targets/green.png
"""
from PIL import Image, ImageDraw
import os

W, H = 1080, 1920
GREEN = (0, 216, 0)        # #00D800
BORDER = (12, 40, 12)      # subtle dark frame
BORDER_PX = 18

img = Image.new("RGB", (W, H), BORDER)
d = ImageDraw.Draw(img)
d.rectangle([BORDER_PX, BORDER_PX, W - 1 - BORDER_PX, H - 1 - BORDER_PX], fill=GREEN)

out = os.path.join(os.path.dirname(__file__), "..", "public", "targets", "green.png")
out = os.path.normpath(out)
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out, "PNG")
print("wrote", out, img.size)
