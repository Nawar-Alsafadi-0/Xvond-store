# CommerceKit commercial preparation (WORK IN PROGRESS)

This branch is a **working copy for commercial adaptation** of Xvond-store. The original `main` branch is unchanged. **Do not distribute or list this branch for sale yet.**

## Completed in this branch
- Removed personal administrator email from the example production environment file.
- Replaced business-specific contact addresses and example site URLs with illustrative placeholders in env example files.
- Replaced two Xvond Box translations with generic Gift Box naming.
- Made logo alternative text configurable with `NEXT_PUBLIC_STORE_NAME` (the image itself is NOT yet generic).

## Additional work completed
- `STORE_NAME` and `ORDER_NUMBER_PREFIX` are configurable in the backend, with an order number prefix validation rule.
- `SHIPPING_PRICING_MODE=free|configured` selects between legacy free delivery and the shipping rate configured for an existing region. `configured` honors `free_over` thresholds.
- Launch-readiness shipping checks now honor the configured pricing mode; added shipping unit tests.
- Production example URLs now use example.com (no deployment to that domain is implied).

**IMPORTANT:** This does not enable international sales or currency choice. Checkout remains Oman-only and stores OMR. Existing examples, images and other brand strings remain to be generalized. Tests have **not been run** on the new branch because CI currently only runs on `main` or pull requests. Do not describe this branch as commercially ready.

## Release blockers
- Product is restricted to Oman, OMR currency, Oman shipping regions, and Oman database-residency checks. These restrictions exist in backend, frontend, seeds, migrations, and tests. Do NOT remove a single guard in isolation: build a coherent configurable market/currency/shipping implementation, then test the complete checkout end-to-end.
- Production currently requires SMTP and Twilio phone verification. Buyer-installation and feature toggles need design and testing, not just removal of validation.
- Xvond logos and brand strings, including image files, remain in the source tree and must be replaced or excluded from the retail distribution with licensed generic assets.
- All example env values must be reviewed for safe placeholders. A sample env file is NOT a functioning production env.
- Check the **full Git history** and every distributed asset for leaked credentials, customer records, or personally identifying details; rotate any exposed secrets. Deleting a value from current source does not remove it from public history.
- Review third-party licensing and assets; create a legally reviewed end-user license and product documentation.
- Run backend tests, frontend tests/build/lint and a fresh Docker install; verify payment/checkout/auth/session workflows. CI/test results have not been verified in this branch.
- Build an isolated retail ZIP (no `.git`, real `.env`, secrets, customer data, logs, backups, proprietary logo), then produce authentic preview screenshots, install instructions and a support policy.
- Codester listing/payout eligibility and commercial demand remain unverified.

## Quick commands (after cloning this branch)
```bash
python scripts/commercial_preflight.py
cd backend && pytest -q
cd ../frontend && npm ci && npm run build
```

WARNING: Passing a simple static check **does not** imply the product is secure, legally licensed, production-ready or approved for sale.
