#!/usr/bin/env python3
"""Write the official CINEVO app icon as PNG, ICO, and ICNS."""
from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
MARK = ROOT.parents[2] / "public" / "brand" / "kit" / "mark-recreated.png"


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def cut_mark() -> Image.Image:
    src = Image.open(MARK).convert("RGBA")
    pix = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = pix[x, y]
            if r < 16 and g < 16 and b < 16:
                pix[x, y] = (0, 0, 0, 0)
    return src.crop(src.getbbox())


def tile(size: int, mark: Image.Image) -> Image.Image:
    top = (34, 24, 46)
    bottom = (58, 18, 88)
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        draw.line((0, y, size, y), fill=color)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), rounded_mask(size, max(2, int(size * 0.22))))
    width = int(size * 0.58)
    height = max(1, int(width * mark.height / mark.width))
    placed = mark.resize((width, height), Image.Resampling.LANCZOS)
    out.alpha_composite(placed, ((size - width) // 2, (size - height) // 2))
    return out


def write_icns(path: Path, pngs: dict[str, bytes]) -> None:
    chunks = []
    for tag, data in pngs.items():
        chunks.append(tag.encode("ascii") + struct.pack(">I", 8 + len(data)) + data)
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)


def main() -> None:
    mark = cut_mark()
    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    rasters = {s: tile(s, mark) for s in sizes}
    for s, im in rasters.items():
        im.save(ROOT / f"icon-{s}.png", "PNG")
    rasters[256].save(ROOT / "icon.png", "PNG")
    rasters[32].save(ROOT / "favicon.png", "PNG")
    rasters[16].save(
        ROOT / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in (16, 32, 48, 64, 128, 256)],
        append_images=[rasters[s] for s in (32, 48, 64, 128, 256)],
    )
    tags = {"icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256, "ic09": 512, "ic10": 1024}
    blobs = {}
    for tag, size in tags.items():
        buf = Path("/tmp") / f"cinevo-{tag}.png"
        rasters[size].save(buf, "PNG")
        blobs[tag] = buf.read_bytes()
    write_icns(ROOT / "AppIcon.icns", blobs)
    print("wrote official CINEVO icons in", ROOT)


if __name__ == "__main__":
    main()
