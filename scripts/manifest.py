"""
manifest.py - Generate icons.json and embed data into index.html
============================================================

PURPOSE:
    Scans every subfolder inside icons/, validates filenames against the
    naming convention, writes a JSON manifest (icons.json), and then
    embeds the data directly into index.html so the viewer works
    offline (from file:// or a shared OneDrive folder).

HOW IT WORKS:
    1. Walk through every file in icons/ (recursively).
    2. Check the file follows the naming convention: {category}-{descriptor}.{ext}
    3. For valid files, build a JSON entry with name, slug, category, tags, file path.
    4. Flag non-compliant files and skip them.
    5. Write the final JSON array to icons.json at the project root.
    6. Inject the JSON data into index.html between marker comments.

USAGE:
    python scripts/manifest.py
"""

import json
import re
import sys
import base64
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

SCRIPTS_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPTS_DIR.parent
ICONS_DIR = PROJECT_ROOT / "icons"
MANIFEST_PATH = PROJECT_ROOT / "icons.json"
INDEX_PATH = PROJECT_ROOT / "index.html"

# Supported image extensions
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg", ".webp"}

# Marker comments in index.html where we inject data
DATA_START_MARKER = "// <!-- ICON_DATA_START -->"
DATA_END_MARKER = "// <!-- ICON_DATA_END -->"

# MIME types for base64 embedding
MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def validate_filename(filepath):
    """
    Check whether a file follows the naming convention:
        {category}-{descriptor}.{ext}

    The category must match the name of the subfolder the file is in.
    The descriptor must be lowercase, hyphen-separated, no spaces/underscores.

    RETURNS: (is_valid: bool, reason: str)
    """
    ext = filepath.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return False, f"Unsupported extension: {ext}"

    # The category is the immediate parent folder name
    category = filepath.parent.name
    stem = filepath.stem  # filename without extension

    # Check the file starts with the category prefix
    expected_prefix = category + "-"
    if not stem.startswith(expected_prefix):
        return False, f"Filename must start with '{expected_prefix}'"

    # Extract the descriptor (everything after the category prefix)
    descriptor = stem[len(expected_prefix):]
    if not descriptor:
        return False, "No descriptor after category prefix"

    return True, ""


def build_display_name(descriptor):
    """
    Convert a hyphenated descriptor into a human-readable display name.

    Examples: 'british-airways-logo' -> 'British Airways Logo'
              'tail-fin'             -> 'Tail Fin'
    """
    return descriptor.replace("-", " ").title()


def build_tags(descriptor, category):
    """
    Auto-generate tags from the descriptor and category.

    We split the descriptor on hyphens to create individual tags,
    then add the category itself as a tag. This gives the search
    bar in the viewer something to match against.

    Example:
        descriptor='british-airways-logo', category='logos'
        -> ['british', 'airways', 'logo', 'logos']
    """
    tags = descriptor.split("-")
    # Add the category as a tag if it's not already included
    if category.lower() not in [t.lower() for t in tags]:
        tags.append(category.lower())
    return tags


def file_to_data_url(filepath):
    """
    Convert a file to a base64 data URL for embedding in HTML.
    This allows the viewer to work without a server (file:// protocol).
    """
    ext = filepath.suffix.lower()
    mime = MIME_TYPES.get(ext, "application/octet-stream")
    data = filepath.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def build_entry(filepath):
    """
    Build a single manifest entry dict for a valid icon file.

    Schema (from CLAUDE.md):
    {
        "name": "Display Name",
        "slug": "category-descriptor",
        "category": "category",
        "tags": ["tag1", "tag2"],
        "file": "icons/category/category-descriptor.ext",
        "source": "filesystem"
    }
    """
    category = filepath.parent.name
    stem = filepath.stem
    descriptor = stem[len(category) + 1:]  # +1 for the hyphen

    # Build the relative path using forward slashes (for web compatibility)
    relative_path = filepath.relative_to(PROJECT_ROOT).as_posix()

    return {
        "name": build_display_name(descriptor),
        "slug": stem,
        "category": category,
        "tags": build_tags(descriptor, category),
        "file": relative_path,
        "source": "filesystem"
    }


def embed_in_html(entries):
    """
    Inject the icon data (with base64 images) into index.html
    between the ICON_DATA_START and ICON_DATA_END markers.

    This makes the viewer fully self-contained — no server needed.
    """
    if not INDEX_PATH.exists():
        print("[WARN] index.html not found - skipping embed")
        return False

    html = INDEX_PATH.read_text(encoding="utf-8")

    if DATA_START_MARKER not in html or DATA_END_MARKER not in html:
        print("[WARN] Could not find data markers in index.html - skipping embed")
        return False

    # Build entries with embedded base64 images
    embedded_entries = []
    for entry in entries:
        img_path = PROJECT_ROOT / entry["file"]
        if img_path.exists():
            embedded_entry = dict(entry)
            embedded_entry["dataUrl"] = file_to_data_url(img_path)
            embedded_entries.append(embedded_entry)
        else:
            embedded_entries.append(entry)

    # Build the replacement JS
    json_str = json.dumps(embedded_entries, ensure_ascii=False)
    replacement = f"{DATA_START_MARKER}\n    var EMBEDDED_ICONS = {json_str};\n    {DATA_END_MARKER}"

    # Find and replace between markers
    start_idx = html.index(DATA_START_MARKER)
    end_idx = html.index(DATA_END_MARKER) + len(DATA_END_MARKER)
    html = html[:start_idx] + replacement + html[end_idx:]

    INDEX_PATH.write_text(html, encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("Icon Library - Manifest Generator")
    print("=" * 60)
    print()

    if not ICONS_DIR.exists():
        print(f"ERROR: Icons directory not found: {ICONS_DIR}")
        sys.exit(1)

    entries = []
    flagged = []
    skipped_dirs = []

    # Walk through every subfolder in icons/
    for category_dir in sorted(ICONS_DIR.iterdir()):
        if not category_dir.is_dir():
            continue

        print(f"Scanning: {category_dir.name}/")

        # Find all files in this category folder
        files = sorted(f for f in category_dir.iterdir() if f.is_file())

        if not files:
            print(f"  (empty)")
            skipped_dirs.append(category_dir.name)
            continue

        for filepath in files:
            is_valid, reason = validate_filename(filepath)

            if not is_valid:
                print(f"  [WARN] {filepath.name} - {reason}")
                flagged.append((filepath.name, reason))
                continue

            entry = build_entry(filepath)
            entries.append(entry)
            print(f"  [OK] {filepath.name}")

    print()

    # Sort entries by category then by slug for consistent ordering
    if entries:
        entries.sort(key=lambda e: (e["category"], e["slug"]))

    # Write icons.json
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(entries if entries else [], f, indent=2, ensure_ascii=False)

    if entries:
        print(f"[OK] Written {len(entries)} entries to {MANIFEST_PATH.name}")
    else:
        print("[WARN] No valid icons found - wrote empty manifest")

    # Embed into index.html
    print()
    print("Embedding data into index.html...")
    if embed_in_html(entries):
        print(f"[OK] Embedded {len(entries)} icons into index.html (with images)")
        print("     Anyone can now open index.html directly - no server needed!")
    else:
        print("[WARN] Could not embed data - index.html will need a server")

    # Summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Valid icons:  {len(entries)}")
    print(f"  Flagged:      {len(flagged)}")
    print(f"  Empty dirs:   {len(skipped_dirs)}")

    if flagged:
        print(f"\n  [WARN] Flagged files (not included in manifest):")
        for name, reason in flagged:
            print(f"    - {name}: {reason}")

    if skipped_dirs:
        print(f"\n  Empty category folders:")
        for d in skipped_dirs:
            print(f"    - {d}/")

    print()


if __name__ == "__main__":
    main()
