"""Generate PWA app icons (192px and 512px) for 喵喵精灵.
Uses a Blender-rendered headshot if available, else procedural PIL."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = r"E:\05_claude\CGmiaomiao\ar"

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Gradient background (rounded square)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    # Radial-ish gradient by stacking circles
    for r in range(size // 2, 0, -1):
        t = r / (size / 2)
        cr = int(95 + (60 * (1 - t)))   # green channel
        cg = int(185 + (40 * (1 - t)))
        cb = int(94 + (50 * (1 - t)))
        bg_draw.ellipse(
            [size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r],
            fill=(cr, cg, cb, 255)
        )
    # Compose onto rounded square
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = int(size * 0.22)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)

    # Try to draw a cat face using Segoe UI Emoji font
    cat_text = "🐱"
    try:
        # Windows path to color emoji font
        font_path = r"C:\Windows\Fonts\seguiemj.ttf"
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, int(size * 0.55))
        else:
            font = ImageFont.load_default()
        bbox = font.getbbox(cat_text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (size - tw) // 2 - bbox[0]
        ty = (size - th) // 2 - bbox[1]
        # Draw shadow first
        shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        shadow_draw.text((tx + 4, ty + 6), cat_text, font=font, fill=(0, 0, 0, 90), embedded_color=True)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=4))
        img = Image.alpha_composite(img, shadow)
        # Draw emoji
        emoji_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        emoji_draw = ImageDraw.Draw(emoji_layer)
        emoji_draw.text((tx, ty), cat_text, font=font, embedded_color=True)
        img = Image.alpha_composite(img, emoji_layer)
    except Exception as e:
        print(f"Emoji rendering failed ({e}), drawing geometric cat face")
        # Simple geometric cat face fallback
        cx, cy = size // 2, size // 2
        face_r = int(size * 0.27)
        # Face (lighter green ellipse)
        draw = ImageDraw.Draw(img)
        draw.ellipse([cx - face_r, cy - face_r, cx + face_r, cy + face_r],
                     fill=(220, 245, 200, 255), outline=(40, 90, 40, 200), width=4)
        # Eyes
        eye_r = int(size * 0.025)
        draw.ellipse([cx - face_r // 2 - eye_r, cy - eye_r * 2,
                      cx - face_r // 2 + eye_r, cy], fill=(20, 20, 20, 255))
        draw.ellipse([cx + face_r // 2 - eye_r, cy - eye_r * 2,
                      cx + face_r // 2 + eye_r, cy], fill=(20, 20, 20, 255))
        # Ears (triangles)
        ear_size = int(size * 0.10)
        # Left ear
        draw.polygon([(cx - face_r * 0.7, cy - face_r * 0.6),
                      (cx - face_r * 0.5, cy - face_r * 1.2),
                      (cx - face_r * 0.2, cy - face_r * 0.6)],
                     fill=(95, 185, 94, 255), outline=(40, 90, 40, 200))
        # Right ear
        draw.polygon([(cx + face_r * 0.7, cy - face_r * 0.6),
                      (cx + face_r * 0.5, cy - face_r * 1.2),
                      (cx + face_r * 0.2, cy - face_r * 0.6)],
                     fill=(95, 185, 94, 255), outline=(40, 90, 40, 200))

    return img

for size in (192, 512):
    img = make_icon(size)
    out_path = os.path.join(OUT_DIR, f"icon-{size}.png")
    img.save(out_path)
    print(f"saved {out_path} ({size}x{size}, {os.path.getsize(out_path)} bytes)")
