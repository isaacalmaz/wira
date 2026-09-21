# Helpdesk / Support Tickets Implementation

This plan will integrate the existing Support Tickets database and UI components into the actual app routing and navigation, making the Helpdesk fully functional across User, Mitra, and Admin apps.

## Proposed Changes

### Database Layer
- Table `support_tickets` already exists (created in 0035). No changes needed.

### User App (`frontend-user`)
- Map `/support` to `SupportPage.jsx` in `App.jsx`.
- Add a menu item "Pusat Bantuan" in `ProfilePage.jsx` linking to `/support`.

### Mitra App (`frontend-mitra`)
- Create `frontend-mitra/src/pages/shared/SupportPage.jsx` by adapting the User app's version but styled for Mitra.
- Map `/support` to `SupportPage.jsx` in `App.jsx`.
- Add a menu item "Pusat Bantuan" in `SettingsPage.jsx` (which acts as the Mitra profile).

### Admin App (`frontend-admin`)
- Map `/support` to `SupportTicketsPage.jsx` in `App.jsx`.
- Add a sidebar item "Pusat Bantuan" in `Sidebar.jsx`.

## Verification Plan
- Verify routing works and users/mitras can submit tickets.
- Verify admins can see, reply, and change ticket status.
