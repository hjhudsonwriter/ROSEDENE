#!/usr/bin/env python3
"""Generate the app icons and header logo for a house.

Writes into icons/ (or --out):
  icon-512.png, icon-192.png, icon-maskable-512.png, apple-touch-icon.png, favicon.png, logo.jpg

Two modes
  1. From a picture of the house (photo or illustration):
       python3 tools/make-icons.py --image path/to/house.jpg
  2. A placeholder made from text, e.g. the house number:
       python3 tools/make-icons.py --text 83 --bg "#1B2A45" --fg "#F4F0E8" --accent "#D9805F"

Needs Pillow (pip install pillow). In --text mode it uses the Cormorant Garamond font; if you
don't pass --font it is downloaded once from the google/fonts repository (open font licence),
falling back to a system serif font if it can't be fetched.
"""
import argparse, os, sys, tempfile, urllib.request
from PIL import Image, ImageDraw, ImageFont

FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf"
FALLBACKS = ["/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
             "/System/Library/Fonts/Supplemental/Georgia Bold.ttf", "C:/Windows/Fonts/georgiab.ttf"]


def find_font(path):
    if path:
        return path
    cache = os.path.join(tempfile.gettempdir(), "CormorantGaramond-wght.ttf")
    if os.path.exists(cache) and os.path.getsize(cache) > 100_000:
        return cache
    try:
        urllib.request.urlretrieve(FONT_URL, cache)
        if os.path.getsize(cache) > 100_000:
            return cache
    except Exception as e:  # offline / blocked
        print("warning: couldn't download Cormorant Garamond (%s)" % e, file=sys.stderr)
    for f in FALLBACKS:
        if os.path.exists(f):
            print("warning: using fallback font", f, file=sys.stderr)
            return f
    sys.exit("No usable font found - pass --font /path/to/font.ttf")


def load_font(path, size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_axes([weight])      # variable fonts only
    except Exception:
        pass
    return f


def text_tile(size, text, bg, fg, accent, font_path, weight, scale=1.0, rule=True):
    """Square tile with the text centred and a short accent rule underneath."""
    tile = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(tile)
    px = int(size * 0.62 * scale)
    f = load_font(font_path, px, weight)
    feats = ["lnum"]                            # lining figures so numbers sit on one baseline
    box = d.textbbox((0, 0), text, font=f, anchor="ls", features=feats)
    # shrink to fit 70% of the tile width
    max_w = size * 0.70 * scale
    if box[2] - box[0] > max_w:
        px = int(px * max_w / (box[2] - box[0]))
        f = load_font(font_path, px, weight)
        box = d.textbbox((0, 0), text, font=f, anchor="ls", features=feats)
    w, h = box[2] - box[0], box[3] - box[1]
    gap = int(size * 0.07 * scale) if rule else 0
    rule_h = max(2, int(size * 0.012)) if rule else 0
    total = h + gap + rule_h
    x = (size - w) / 2 - box[0]
    y = (size - total) / 2 - box[1]
    d.text((x, y), text, font=f, fill=fg, anchor="ls", features=feats)
    if rule:
        rw = int(w * 0.38)
        ry = int(y + box[3] + gap)
        d.rectangle([(size - rw) // 2, ry, (size + rw) // 2, ry + rule_h], fill=accent)
    return tile


def image_tile(src, size, pad, bg="#FFFFFF"):
    tile = Image.new("RGB", (size, size), bg)
    inner = int(size * (1 - 2 * pad))
    r = src.copy()
    r.thumbnail((inner, inner), Image.LANCZOS)
    tile.paste(r, ((size - r.width) // 2, (size - r.height) // 2))
    return tile


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--image", help="picture of the house")
    ap.add_argument("--text", help="placeholder text, e.g. the house number")
    ap.add_argument("--bg", default="#1B2A45", help="icon background colour (text mode) [default navy]")
    ap.add_argument("--fg", default="#F4F0E8", help="text colour on the icon (text mode)")
    ap.add_argument("--accent", default="#D9805F", help="colour of the rule under the text (text mode)")
    ap.add_argument("--font", help="path to a .ttf font (text mode)")
    ap.add_argument("--weight", type=int, default=600, help="font weight for variable fonts")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons"))
    a = ap.parse_args()
    if bool(a.image) == bool(a.text):
        ap.error("give exactly one of --image or --text")
    os.makedirs(a.out, exist_ok=True)

    if a.image:
        src = Image.open(a.image).convert("RGBA")
        flat = Image.new("RGBA", src.size, (255, 255, 255, 255)); flat.alpha_composite(src); src = flat.convert("RGB")
        master = lambda: image_tile(src, 512, 0.10)
        tiles = {"icon-512.png": image_tile(src, 512, 0.10), "icon-192.png": image_tile(src, 192, 0.10),
                 "apple-touch-icon.png": image_tile(src, 180, 0.06), "favicon.png": image_tile(src, 64, 0.03),
                 "icon-maskable-512.png": image_tile(src, 512, 0.22)}
        logo = src.copy(); logo.thumbnail((480, 480), Image.LANCZOS)
    else:
        font = find_font(a.font)
        big = text_tile(1024, a.text, a.bg, a.fg, a.accent, font, a.weight)
        mask = text_tile(1024, a.text, a.bg, a.fg, a.accent, font, a.weight, scale=0.78)
        tiles = {"icon-512.png": big.resize((512, 512), Image.LANCZOS), "icon-192.png": big.resize((192, 192), Image.LANCZOS),
                 "apple-touch-icon.png": big.resize((180, 180), Image.LANCZOS), "favicon.png": big.resize((64, 64), Image.LANCZOS),
                 "icon-maskable-512.png": mask.resize((512, 512), Image.LANCZOS)}
        # header logo: dark text on white (the theme decides whether to blend it or show it on a white tile)
        logo = text_tile(1024, a.text, "#FFFFFF", a.bg, a.accent, font, a.weight, scale=0.9).resize((480, 480), Image.LANCZOS)
        logo = logo.crop((0, 20, 480, 460))     # 480x440 like the original logo

    for name, im in tiles.items():
        im.save(os.path.join(a.out, name))
    logo.save(os.path.join(a.out, "logo.jpg"), quality=90)
    print("wrote", ", ".join(list(tiles) + ["logo.jpg"]), "to", os.path.normpath(a.out))


if __name__ == "__main__":
    main()
