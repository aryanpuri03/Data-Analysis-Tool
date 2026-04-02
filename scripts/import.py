"""
import.py — Asset Import Pipeline for Icon Library
===========================================================

PURPOSE:
    Takes images (PNG, JPG, SVG) from the source/ folder, removes
    backgrounds from raster images (using remove.bg API), and imports
    them into the Icon Library at icons/{category}/ with
    standardised naming conventions.

HOW IT WORKS:
    1. Find all supported images in source/
    2. For each image:
       a) Work out which category the icon belongs to and its descriptor.
          If it can't be inferred, ask the user interactively.
       b) Remove the background using the remove.bg API (PNG/JPG only).
          Falls back to a local Pillow floodfill method if the API fails.
       c) Rename the file (e.g., logos-ryanair-logo.png).
       d) Save the transparent PNG to the correct folder.
    3. Print a summary.

DEPENDENCIES:
    - Pillow    (pip install Pillow)
    - remove.bg API key (free tier: 50 images/month)
"""

import os
import sys
import re
import shutil
import io
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Tuple

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print("ERROR: Pillow is not installed. Run:  pip install Pillow")
    sys.exit(1)

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# remove.bg API key (free tier: 50 images/month)
# Get yours at https://www.remove.bg/api
REMOVE_BG_API_KEY = "WzmgTPkCb6di1sayMhJrUdcs"

# Paths
SCRIPTS_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPTS_DIR.parent
SOURCE_DIR = PROJECT_ROOT / "source"
ICONS_DIR = PROJECT_ROOT / "icons"

# Standard Categories 
CATEGORIES = {
    'Plane Fins',
    'logos',
    'name logo'}

# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def infer_category(filename):
    """
    Try to work out the icon's category from its filename.
    
    WHY: The naming convention is {category}-{descriptor}.png, so if the
    filename starts with a known category slug, we can extract it
    automatically.  This saves the user from typing the category for
    every single file.
    
    HOW: We check if the filename (without extension) starts with any
    of our valid category slugs.  We check longest slugs first so that
    "passenger-services" matches before "passenger" would.
    
    RETURNS: (category: str or None, descriptor: str)
    """
    stem = Path(filename).stem.lower()

    # Sort categories by length (longest first) to match correctly
    # e.g. "passenger-services" should match before a hypothetical "passenger"
    for cat in sorted(CATEGORIES, key=len, reverse=True):
        cat_lower = cat.lower()
        if stem.startswith(cat_lower + "-"):
            start = len(cat_lower) + 1   # +1 for the hyphen
            descriptor = stem[start:]
            return cat, descriptor
        elif stem == cat_lower:
            # Filename is just the category with no descriptor
            return cat, ""

    return None, stem


def prompt_for_category(filename: str) -> Tuple[Optional[str], Optional[str]]:
    
    stem = Path(filename).stem.lower()
    print(f"\n  Cannot infer category from filename: '{filename}'")
    print(f"  Valid categories:")
    categories_list = sorted(CATEGORIES)
    for i, cat in enumerate(categories_list, 1):
        print(f"    {i}. {cat}")
    print(f"    s. Skip this file")

    while True:
        choice = input(f"  Choose category (1-{len(categories_list)}) or 's' to skip: ").strip()
        if choice.lower() == "s":
            return None, None
        try:
            idx = int(choice)
            if 1 <= idx <= len(categories_list):
                category = categories_list[idx - 1]
                # Ask for a descriptor if the filename doesn't have one
                descriptor = input(f"  Enter a descriptor for this icon (e.g. 'departures'): ").strip().lower()
                # Clean up: replace spaces/underscores with hyphens
                descriptor = re.sub(r"[\s_]+", "-", descriptor)
                descriptor = re.sub(r"[^a-z0-9-]", "", descriptor)
                if not descriptor:
                    print("  [ERR] Descriptor cannot be empty. Try again.")
                    continue
                return category, descriptor
        except ValueError:
            pass
        print(f"  [ERR] Invalid choice. Enter a number 1-{len(categories_list)} or 's'.")

    # This line is unreachable (the while True loop always returns above),
    # but the type checker needs an explicit return.
    return None, None


def sanitise_filename_stem(category, descriptor):
    """
    Build the final SVG filename following the naming convention.
    
    WHY: All icons must follow the pattern {category}-{descriptor}.svg
    with lowercase letters, hyphens only, no spaces or underscores.
    This function enforces those rules.
    
    RETURNS: The sanitised filename string, e.g. "wayfinding-departures"
    """
    # Clean descriptor: lowercase, hyphens only
    descriptor = descriptor.lower()
    descriptor = re.sub(r"[\s_]+", "-", descriptor)  # spaces/underscores → hyphens
    descriptor = re.sub(r"[^a-z0-9-]", "", descriptor)  # remove anything weird
    descriptor = re.sub(r"-+", "-", descriptor)  # collapse multiple hyphens
    descriptor = descriptor.strip("-")  # no leading/trailing hyphens

    return f"{category}-{descriptor}"


def remove_bg_api(image_path: Path) -> Image.Image:
    """
    Remove background using the remove.bg REST API.
    
    HOW IT WORKS:
    1. Read the raw image bytes from disk.
    2. Build a multipart/form-data HTTP POST request to remove.bg.
    3. The API returns a PNG with a transparent background.
    4. We open that PNG with Pillow and return it.
    
    WHY THIS IS THE BEST OPTION:
    - remove.bg is purpose-built for background removal.
    - It handles photos (tail fins) AND flat graphics (logos) perfectly.
    - Clean edges, no aliasing, no interior damage.
    - Free tier: 50 images/month.
    """
    
    # 1. READ THE IMAGE FILE AS RAW BYTES
    # We send the original file directly to the API (not a Pillow object)
    # because the API expects raw image data.
    with open(image_path, "rb") as f:
        image_data = f.read()
    
    # 2. BUILD THE MULTIPART FORM DATA
    # The remove.bg API expects a multipart/form-data POST with:
    #   - "image_file": the raw image bytes
    #   - "size": "auto" means the API picks the best resolution
    # We have to build the multipart body manually since we're using
    # urllib (Python built-in) instead of the 'requests' library.
    boundary = "----PythonFormBoundary7MA4YWxkTrZu0gW"
    
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image_file"; filename="{image_path.name}"\r\n'
        f"Content-Type: application/octet-stream\r\n"
        f"\r\n"
    ).encode("utf-8")
    body += image_data
    body += f"\r\n--{boundary}\r\n".encode("utf-8")
    body += (
        f'Content-Disposition: form-data; name="size"\r\n'
        f"\r\n"
        f"auto\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    
    # 3. SEND THE REQUEST TO REMOVE.BG
    # We create a POST request with the API key in the header.
    req = urllib.request.Request(
        "https://api.remove.bg/v1.0/removebg",
        data=body,
        headers={
            "X-Api-Key": REMOVE_BG_API_KEY,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    
    # 4. RECEIVE THE RESPONSE
    # The API returns raw PNG bytes with the background already removed.
    # We wrap them in a BytesIO stream so Pillow can open them directly.
    with urllib.request.urlopen(req) as response:
        result_bytes = response.read()
    
    # 5. CONVERT TO A PILLOW IMAGE AND RETURN
    result_image = Image.open(io.BytesIO(result_bytes))
    return result_image


def remove_background_fallback(img: Image.Image, category: str = "", threshold: int = 15) -> Image.Image:
    """
    FALLBACK: Remove background using local Pillow floodfill.
    
    This is only used if the remove.bg API fails (e.g., rate limit hit,
    no internet). It uses the same threshold-based alpha trimming approach
    we built earlier.
    """
    
    working_copy = img.copy().convert("RGBA")
    width, height = working_copy.size
    
    bg_color = working_copy.getpixel((0, 0))
    
    padded = Image.new("RGBA", (width + 2, height + 2), bg_color)
    padded.paste(working_copy, (1, 1))

    magic_color = (255, 0, 255, 255)
    
    ImageDraw.floodfill(padded, xy=(0, 0), value=magic_color, thresh=threshold)
    
    flooded = padded.crop((1, 1, width + 1, height + 1))

    flooded_data = flooded.getdata()
    mask_data = []
    removed_count = 0
    total_pixels = width * height
    
    for pixel in flooded_data:
        if pixel == magic_color:
            mask_data.append(0)
            removed_count += 1
        else:
            mask_data.append(255)
            
    if category == 'Plane Fins':
        max_removal_ratio = 0.75
    elif category in ['logos', 'name logo']:
        max_removal_ratio = 0.80
    else:
        max_removal_ratio = 0.50
        
    if removed_count > (total_pixels * max_removal_ratio):
        raise ValueError(f"Too much of the image removed ({removed_count}/{total_pixels} pixels, max allowed {max_removal_ratio*100}%).")

    mask = Image.new("L", (width, height))
    mask.putdata(mask_data)
    
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.MaxFilter(3))
    
    working_copy.putalpha(mask)
    return working_copy


def remove_white_background(img: Image.Image, threshold: int = 30) -> Image.Image:
    """
    Remove white/near-white background from logo images.
    
    Unlike remove.bg (which aggressively strips anything it thinks is
    background), this function ONLY makes pixels transparent if they
    are close to pure white.  This preserves all the actual logo colours.
    
    HOW IT WORKS:
    1. Convert the image to RGBA.
    2. For every pixel, check if R, G, and B are all within `threshold`
       of 255 (i.e. the pixel is nearly white).
    3. If so, set alpha to 0 (transparent). Otherwise, keep it opaque.
    
    PARAMETERS:
        threshold: how far from pure white (255) a channel can be and
                   still count as "white".  Default 30 means any pixel
                   with R>=225, G>=225, B>=225 is treated as background.
    """
    working = img.convert("RGBA")
    pixels = working.load()
    width, height = working.size
    
    cutoff = 255 - threshold  # e.g. 225 when threshold=30
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if r >= cutoff and g >= cutoff and b >= cutoff:
                pixels[x, y] = (r, g, b, 0)  # make transparent
    
    return working


# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------

def main():
    """
    The main integration pipeline.
    """
    print("=" * 60)
    print("Icon Library — Asset Import Pipeline")
    print("=" * 60)
    print()

    # Step 1: Find all images in source/
    if not SOURCE_DIR.exists():
        print(f"ERROR: Source directory not found: {SOURCE_DIR}")
        sys.exit(1)

    # chain allows us to find multiple extensions and combine them into one list
    from itertools import chain
    png_files = SOURCE_DIR.glob("*.png")
    jpg_files = SOURCE_DIR.glob("*.jpg")
    jpeg_files = SOURCE_DIR.glob("*.jpeg")
    svg_files = SOURCE_DIR.glob("*.svg")
    
    # Sort them all together alphabetically
    source_files = sorted(chain(png_files, jpg_files, jpeg_files, svg_files))
    
    if not source_files:
        print(f"No PNG, JPG, JPEG, or SVG files found in {SOURCE_DIR}")
        print("Place your source images in the source/ folder and run again.")
        sys.exit(0)

    print(f"Found {len(source_files)} image file(s) in source/\n")

    # Tracking results for the summary
    successes = []
    flagged = []
    skipped = []

    # Step 2: Process each image
    for img_path in source_files:
        print(f"Processing: {img_path.name}")

        # 2a) Figure out the category
        category, descriptor = infer_category(img_path.name)
        if category is None:
            # BEFORE prompting the user, check if this file was already
            # processed under ANY category. This avoids re-prompting for
            # oddly-named files (e.g. "air belgium name logo.png") that
            # were manually categorized in a previous run.
            stem = Path(img_path.name).stem
            is_svg_check = img_path.suffix.lower() == '.svg'
            ext_check = img_path.suffix if is_svg_check else '.png'
            already_done = False
            for cat in CATEGORIES:
                potential_stem = sanitise_filename_stem(cat, stem)
                potential_path = ICONS_DIR / cat / f"{potential_stem}{ext_check}"
                if potential_path.exists():
                    print(f"  [SKIP] Already exists: {potential_path.relative_to(PROJECT_ROOT)}")
                    skipped.append(img_path.name)
                    already_done = True
                    break
            if already_done:
                continue

            prompt_result: Tuple[Optional[str], Optional[str]] = prompt_for_category(img_path.name)
            category = prompt_result[0]
            descriptor = prompt_result[1] if prompt_result[1] is not None else ""
            if category is None:
                print("  >>> Skipped by user")
                skipped.append(img_path.name)
                continue

        if not descriptor:
            print(f"  [ERR] No descriptor could be determined. Skipping.")
            skipped.append(img_path.name)
            continue

        # 2b) Build the output filename and path
        #     Raster images are always saved as .png (for transparency)
        #     SVGs are copied as-is
        out_filename_stem = sanitise_filename_stem(category, descriptor)
        is_svg = img_path.suffix.lower() == '.svg'
        out_ext = img_path.suffix if is_svg else '.png'
        out_filename = f"{out_filename_stem}{out_ext}"
        out_dir = ICONS_DIR / category
        out_path = out_dir / out_filename

        # SKIP if this file already exists in icons/
        # This means we only process images that haven't been imported yet
        # (e.g., ones that hit the API paywall last time).
        if out_path.exists():
            print(f"  [SKIP] Already exists: {out_path.relative_to(PROJECT_ROOT)}")
            skipped.append(img_path.name)
            continue

        # Make sure the category directory exists
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"  Category:   {category}")
        print(f"  Descriptor: {descriptor}")
        print(f"  Output:     {out_path.relative_to(PROJECT_ROOT)}")

        # 2c) Process and save
        try:
            if is_svg:
                # SVGs don't need background removal — just copy
                shutil.copy2(img_path, out_path)
                print(f"  [OK] Copied (SVG)")
            else:
                # Raster image: remove background
                # Logos & name logos → simple white-to-transparent (preserves colours)
                # Plane Fins → remove.bg API (handles complex photo backgrounds)
                if category in ('logos', 'name logo'):
                    print(f"  ... Removing white background (logo mode)")
                    img = Image.open(img_path)
                    result = remove_white_background(img)
                    result.save(out_path, format='PNG')
                    print(f"  [OK] Saved with transparent background (white removal)")
                else:
                    try:
                        print(f"  ... Removing background (remove.bg API)")
                        result = remove_bg_api(img_path)
                        result.save(out_path, format='PNG')
                        print(f"  [OK] Saved with transparent background (API)")
                    except (urllib.error.URLError, urllib.error.HTTPError) as api_err:
                        print(f"  [WARN] API failed ({api_err}), using local fallback...")
                        img = Image.open(img_path)
                        result = remove_background_fallback(img, category=category)
                        result.save(out_path, format='PNG')
                        print(f"  [OK] Saved with transparent background (fallback)")
                
            successes.append(out_filename)
        except Exception as e:
            flagged.append((img_path.name, f"Failed to process: {e}"))
            print(f"  [ERR] {e}")

    # Step 3: Print summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Imported: {len(successes)}")
    print(f"  Flagged:   {len(flagged)}")
    print(f"  Skipped:   {len(skipped)}")

    if successes:
        print(f"\n  [OK] Successfully imported:")
        for name in successes:
            print(f"    - {name}")

    if flagged:
        print(f"\n  [WARN] Flagged (not saved - fix source images and retry):")
        for name, reason in flagged:
            print(f"    - {name}: {reason}")

    if skipped:
        print(f"\n  >>> Skipped:")
        for name in skipped:
            print(f"    - {name}")

    print()


if __name__ == "__main__":
    main()
