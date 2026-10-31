#!/usr/bin/env python3
"""Build a sanitized *release candidate*, never claim this is ready for sale.

Runs only on a checked-out source tree. Uses Git-tracked files, not live data.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist" / "CommerceKit_Oman_Release_Candidate.zip"
DENY_NAMES = {".env", ".env.production", ".git", "__pycache__", "node_modules", ".next", "backups", "media"}
DENY_PATHS = {
    "frontend/public/assets/logo.png",
    "frontend/public/xvond-store-logo.png",
    "README.md",  # describes the original owner and is not buyer documentation
    "BUSINESS.md",
}
ALLOWED_ENV = {".env.example", ".env.production.example"}
PRIVATE_MARKERS = (
    "nhxg369@gmail.com",
    "nawar.alsafadi",
)
BLOCKED_EXT = {".pem", ".key", ".p12", ".pfx", ".sqlite", ".sqlite3", ".db", ".log"}
BUYER_README = """# CommerceKit Oman — Retail Release Candidate

**NOT READY FOR COMMERCIAL DISTRIBUTION OR A MARKETPLACE LISTING.**

This is a staging ZIP of a bilingual store script adapted from the owner's
project. Its scope remains Oman-only: OMR, Oman delivery areas, and the
production Oman residency policy. It requires PostgreSQL and an application
server, and production registration may require SMTP and Twilio services.
The merchant provides their own accounts, hosting and credentials.

IMPORTANT: Before a sale, carry out a full history/secret and licensing audit,
replace all proprietary visuals, finish brand review, test a fresh production
installation and real checkout, provide an EULA and support documentation,
and check the marketplace's author and payout requirements.
README and app source are not a guarantee of security or merchant suitability.
"""

def main() -> int:
    entries = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    files = []
    found = []
    for raw in entries:
        if not raw:
            continue
        parts = Path(raw).parts
        if raw in DENY_PATHS or any(p in DENY_NAMES for p in parts):
            continue
        if raw.startswith(("docs/internal/", ".github/", "dist/")):
            continue
        if (any(p.startswith(".env") for p in parts) and raw not in ALLOWED_ENV):
            continue
        if Path(raw).suffix.lower() in BLOCKED_EXT:
            continue
        source = ROOT / raw
        if not source.is_file() or source.is_symlink():
            continue
        if source.stat().st_size > 5 * 1024 * 1024:
            continue
        if source.suffix.lower() in {".py", ".ts", ".tsx", ".js", ".json", ".md", ".yml", ".yaml", ".toml", ".sh", ".example"} or raw in ALLOWED_ENV:
            txt = source.read_text(encoding="utf-8", errors="replace")
            if any(marker.lower() in txt.lower() for marker in PRIVATE_MARKERS):
                found.append(raw)
            # Real secrets must be scanned separately, including historical commits.
        files.append((raw, source))
    if found:
        print("Refusing candidate packaging; known personal identifiers remain:", found, file=sys.stderr)
        return 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as bundle:
        for raw, source in files:
            bundle.write(source, "CommerceKit/" + raw)
        bundle.writestr("CommerceKit/RETAIL_README.md", BUYER_README)
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    print(f"Candidate: {OUTPUT.relative_to(ROOT)}; files: {len(files)}; SHA-256: {digest}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
