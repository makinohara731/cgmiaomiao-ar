from PIL import Image, ImageDraw
import random, math
random.seed(7)  # deterministic
W = H = 1024
AR = "E:/05_claude/CGmiaomiao/ar"
img = Image.new("RGB", (W, H), (248, 246, 238))
d = ImageDraw.Draw(img)
PAL = [(46,182,125),(255,107,107),(255,196,60),(90,140,255),(196,80,200),(40,44,52),(255,150,90),(80,200,190)]

def star(cx, cy, r, c, rot=0.0):
    pts=[]
    for i in range(10):
        ang = rot + i*math.pi/5
        rr = r if i%2==0 else r*0.45
        pts.append((cx+rr*math.cos(ang), cy+rr*math.sin(ang)))
    d.polygon(pts, fill=c)

def tri(cx, cy, r, c, rot=0.0):
    pts=[(cx+r*math.cos(rot+i*2*math.pi/3), cy+r*math.sin(rot+i*2*math.pi/3)) for i in range(3)]
    d.polygon(pts, fill=c)

# dense high-contrast scatter across the WHOLE card (rich corners/edges = good features)
for _ in range(170):
    x, y = random.randint(0, W), random.randint(0, H)
    s = random.randint(10, 46)
    c = random.choice(PAL)
    k = random.random()
    if k < 0.3:   d.ellipse([x-s,y-s,x+s,y+s], fill=c)
    elif k < 0.55: d.rectangle([x-s,y-s,x+s,y+s], fill=c)
    elif k < 0.78: tri(x, y, s, c, random.random()*6.28)
    else:          star(x, y, s, c, random.random()*6.28)

# centre: the cat icon (gives a clear recognisable focal area)
icon = Image.open(f"{AR}/public/icon-512.png").convert("RGBA").resize((430,430))
img.paste(icon, (W//2-215, H//2-215), icon)
# a contrasting ring behind the icon for stronger edges
d.ellipse([W//2-235, H//2-235, W//2+235, H//2+235], outline=(40,44,52), width=14)

# four DISTINCT corner glyphs — break rotational symmetry so MindAR locks orientation
star(120,120,70,(255,107,107),0)              # TL star
d.rectangle([W-200,70,W-70,200], fill=(46,182,125))   # TR square
tri(120,H-120,80,(90,140,255),0)              # BL triangle
d.ellipse([W-200,H-200,W-70,H-70], fill=(255,196,60))  # BR circle

# bold border
d.rectangle([16,16,W-16,H-16], outline=(40,44,52), width=12)
out = f"{AR}/public/targets/miao-card.png"
img.save(out, "PNG")
print("saved", out, img.size)
