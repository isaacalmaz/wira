---
name: wira-context
description: >-
  Essential context about the Wira project architecture, payment systems (WiraPay),
  GPS geolocation fallbacks, and layout structures. Read this when modifying the app.
---

# Wira Architecture & Context

## 1. WiraPay & Top-Up Strategy
- The app uses a Static QRIS (DANA) flow as a bridge while Midtrans is pending.
- A "Unique Code" (1-999) is randomly generated and appended to every top-up amount.
- This is strictly enforced in PostgreSQL via `setup_wallet.sql` using a trigger (`amount % 1000 > 0`) and a partial unique index on pending requests to avoid collisions.
- The UI must NOT contain Virtual Account (VA) options. Only one QRIS path is active. The unique digits must be styled with `whitespace-nowrap` and `font-extrabold` to avoid text breaking on mobile.

## 2. Geolocation & Map Constraints
- `navigator.geolocation` frequently fails on Desktop Safari/Chrome (e.g., macOS Privacy Blocks = error code 1, or Wi-Fi triangulation failure = error code 2).
- Never hard-lock the app strictly to GPS. Always provide graceful UI error messages based on `error.code` and provide manual fallback inputs.
- Proximity matching (Nearest Driver) is handled via PostGIS (`<->`) in `setup_nearest_driver.sql`.

## 3. Desktop UI Layout
- The global `Layout.jsx` container restricts max width to `max-w-4xl`.
- To allow the Map (e.g. `/ride` route) to render edge-to-edge (full-bleed) on Desktop, the layout conditionally disables the max-width wrapper on that specific route.
