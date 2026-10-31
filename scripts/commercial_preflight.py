#!/usr/bin/env python3
"""Fail-closed checklist of known CommerceKit conversion blockers (not a secret scanner)."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
issues = []

def check(path, needles, description):
    file = ROOT / path
    if not file.exists():
        issues.append(f"{description}: missing expected file {path}")
        return
    text = file.read_text(encoding="utf-8", errors="replace")
    if any(needle.lower() in text.lower() for needle in needles):
        issues.append(f"{description}: inspect {path} (not generalized)")

check("backend/app/core/config.py", ["current launch", '!= "OM"', "Twilio Verify configuration is required"], "Market/auth hardcoding")
check("backend/app/api/readiness_admin.py", ["OMAN_GOVERNORATE_KEYS", "Oman only"], "Oman-specific readiness")
check("backend/app/services/shipping/local.py", ["OMAN_GOVERNORATE_ALIASES", 'Decimal("0.000")'], "Oman-only free shipping")
check("frontend/components/checkout-view.tsx", ["XVOND VAULT", "GOVERNORATES"], "Store branding/checkout")
check("frontend/components/store-logo.tsx", ["assets/logo.png"], "Proprietary brand image")
check(".env.production.example", ["xvond.com", "nhxg369@"], "Personal-domain example data")

if not (ROOT / "LICENSE").exists():
    issues.append("Distribution license not present; review code/assets rights before adding one")

print("CommerceKit commercial readiness blockers:")
if issues:
    for idx, item in enumerate(issues, 1):
        print(f"{idx}. {item}")
    print("\nNOT READY FOR DISTRIBUTION. These checks do not scan Git history or secrets.")
    sys.exit(1)

print("Known markers absent; manual security, licensing, functional and release review still required.")
