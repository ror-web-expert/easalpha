#!/usr/bin/env python3
"""Gives a demo business a full set of brand images: a logo (also the favicon), a cover, one picture per category and
per product. Drawn with Pillow (gradient, a plate motif, the name) and uploaded through POST /uploads, so they live in
Active Storage like real uploads; then saved on the business, Website Config identity, categories and products.

Usage: python3 scripts/demo-images.py <api base> <owner email> <owner password> [--only-missing]
  e.g. python3 scripts/demo-images.py http://localhost:3001/api/v1 demo@easalpha.com password123
--only-missing keeps pictures that are already set and fills in the gaps.
"""
import io, json, sys, urllib.request, uuid
from PIL import Image, ImageChops, ImageDraw, ImageFont

API, EMAIL, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
ONLY_MISSING = "--only-missing" in sys.argv
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
NAVY, ORANGE, CREAM = (16, 41, 77), (255, 122, 26), (255, 247, 237)
# Category palettes: (top colour, bottom colour, ring colour). Unknown categories cycle through them.
PALETTES = {
    "bbq": ((160, 48, 24), (214, 86, 36), (255, 140, 90)), "burgers": ((178, 108, 24), (214, 150, 40), (255, 212, 110)),
    "karahi": ((150, 60, 20), (200, 96, 40), (255, 150, 90)), "rice": ((96, 110, 40), (140, 150, 60), (220, 220, 140)),
    "drinks": ((24, 90, 140), (50, 140, 200), (140, 210, 255)), "desserts": ((150, 60, 110), (200, 100, 150), (255, 180, 220)),
    "breakfast": ((170, 120, 30), (220, 170, 60), (255, 230, 150)), "deals": ((90, 50, 140), (130, 90, 190), (200, 170, 255)),
}
PALETTE_LIST = list(PALETTES.values())


def gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def dish(name, category, palette):
    top, bottom, ring = palette
    img = gradient(800, 600, top, bottom)
    d = ImageDraw.Draw(img)
    d.ellipse((470, 80, 760, 370), fill=ring)
    d.ellipse((520, 130, 710, 320), fill=CREAM)
    font = ImageFont.truetype(FONT, 46)
    lines = wrap(d, name, font, 560)[:3]
    y = 520 - 56 * len(lines)
    for line in lines:
        d.text((50, y), line, font=font, fill=CREAM)
        y += 56
    d.text((50, 535), category.upper(), font=ImageFont.truetype(FONT, 22), fill=(255, 230, 200))
    return img, "JPEG"


def category_picture(name, palette):
    top, bottom, ring = palette
    img = gradient(800, 600, top, bottom)
    d = ImageDraw.Draw(img)
    d.ellipse((-120, 300, 260, 680), fill=ring)
    d.ellipse((560, -140, 900, 200), fill=ring)
    font = ImageFont.truetype(FONT, 64)
    lines = wrap(d, name, font, 640)[:2]
    y = 300 - 40 * len(lines)
    for line in lines:
        d.text((400, y), line, font=font, fill=CREAM, anchor="ma")
        y += 80
    return img, "JPEG"


def cover(name, tagline):
    # Navy at the top left to orange at the bottom right: half a horizontal and half a vertical gradient as the mask.
    across = Image.linear_gradient("L").rotate(90, expand=True).resize((1600, 600))
    down = Image.linear_gradient("L").resize((1600, 600))
    mask = ImageChops.add(across.point(lambda v: v // 2), down.point(lambda v: v // 2))
    img = Image.composite(Image.new("RGB", (1600, 600), (220, 100, 30)), Image.new("RGB", (1600, 600), NAVY), mask)
    d = ImageDraw.Draw(img)
    for box, colour in (((1210, 30, 1390, 210), ORANGE), ((1320, 280, 1600, 560), (40, 70, 110)), ((90, 380, 310, 600), ORANGE), ((840, 0, 960, 120), (40, 70, 110))):
        d.ellipse(box, fill=colour)
    d.text((80, 200), name, font=ImageFont.truetype(FONT, 118), fill=CREAM)
    d.text((82, 345), tagline, font=ImageFont.truetype(FONT, 44), fill=(255, 225, 190))
    return img, "JPEG"


def logo(name):
    img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((16, 16, 496, 496), fill=NAVY)
    d.ellipse((40, 40, 472, 472), outline=ORANGE, width=10)
    # The cloche and plate, the EasAlpha dish mark.
    d.pieslice((120, 150, 392, 400), 180, 360, fill=CREAM)
    d.rounded_rectangle((104, 290, 408, 318), radius=14, fill=CREAM)
    d.ellipse((238, 120, 274, 156), fill=ORANGE)
    font = ImageFont.truetype(FONT, 44 if len(name) <= 10 else 34)
    d.text((256, 398), name.upper(), font=font, fill=CREAM, anchor="ma")
    return img, "PNG"


def request(method, path, body=None, token=None, files=None):
    url = f"{API}{path}"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if files:
        boundary = uuid.uuid4().hex
        data = b""
        for field, (filename, content, ctype) in files.items():
            data += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode() + content + b"\r\n"
        data += f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        data = json.dumps(body).encode() if body is not None else None
        if data is not None:
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def upload(token, name, image, fmt):
    buf = io.BytesIO()
    image.save(buf, fmt, quality=88) if fmt == "JPEG" else image.save(buf, fmt)
    ext, ctype = ("jpg", "image/jpeg") if fmt == "JPEG" else ("png", "image/png")
    status, j = request("POST", "/uploads", token=token, files={"file": (f"{name}.{ext}", buf.getvalue(), ctype)})
    if status != 201:
        raise SystemExit(f"upload failed {status}: {j}")
    return j["key"]


def main():
    status, j = request("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
    if status != 200:
        raise SystemExit(f"login failed {status}: {j}")
    token = j["access_token"]
    biz = request("GET", "/business", token=token)[1]
    name = biz["name"]
    slug = (biz.get("slug") or name.lower().replace(" ", "-"))

    wc = request("GET", "/website_config", token=token)[1]
    identity = dict(wc.get("sections", {}).get("identity") or {})
    tagline = identity.get("description") or "Family dining since 1998"
    changed = {}
    if not (ONLY_MISSING and biz.get("logo_key")):
        logo_key = upload(token, f"{slug}-logo", *logo(name))
        request("PATCH", "/business", {"logo_key": logo_key}, token=token)
        changed["logo_key"] = logo_key
        changed["favicon_key"] = logo_key
        print("logo and favicon set")
    if not (ONLY_MISSING and identity.get("cover_key")):
        changed["cover_key"] = upload(token, f"{slug}-cover", *cover(name, f"{tagline} · Lahore" if "Lahore" not in tagline else tagline))
        print("cover set")
    if not identity.get("description"):
        changed["description"] = tagline
    if changed:
        request("PATCH", "/website_config", {"sections": {"identity": {**identity, **changed}}}, token=token)

    cats = request("GET", "/categories", token=token)[1]["data"]
    palette_of = {}
    for i, c in enumerate(cats):
        palette_of[c["id"]] = PALETTES.get(c["name"].strip().lower(), PALETTE_LIST[i % len(PALETTE_LIST)])
        if ONLY_MISSING and c.get("image_key"):
            continue
        key = upload(token, f"{slug}-category-{i + 1}", *category_picture(c["name"], palette_of[c["id"]]))
        request("PATCH", f"/categories/{c['id']}", {"image_key": key}, token=token)
    print(f"{len(cats)} categories pictured")

    products, cursor, n = [], None, 0
    while True:
        status, page = request("GET", f"/products?limit=100{f'&cursor={cursor}' if cursor else ''}", token=token)
        products += page["data"]
        cursor = page.get("cursor") or page.get("next_cursor")
        if not cursor:
            break
    cat_name = {c["id"]: c["name"] for c in cats}
    for i, p in enumerate(products):
        if ONLY_MISSING and p.get("image_key"):
            continue
        palette = palette_of.get(p.get("category_id"), PALETTE_LIST[i % len(PALETTE_LIST)])
        key = upload(token, f"{slug}-product-{i + 1}", *dish(p["name"], cat_name.get(p.get("category_id"), ""), palette))
        status, j = request("PATCH", f"/products/{p['id']}", {"image_key": key}, token=token)
        if status != 200:
            raise SystemExit(f"product {p['name']}: {status} {j}")
        n += 1
    print(f"{n} of {len(products)} products pictured")


main()
