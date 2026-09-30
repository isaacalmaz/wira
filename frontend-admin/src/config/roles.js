// Admin role sets, shared by the route guards (App.jsx) and the sidebar
// (AdminSidebar.jsx) so the menu always shows exactly the pages a role can
// open. Keep these in sync with is_admin() / role checks in the database.
export const CORE_ADMIN_ROLES = ['admin', 'Superadmin', 'superadmin', 'Admin Ops'];
export const ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'CS', 'Admin Keuangan'];
export const CS_ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'CS'];
export const FINANCE_ADMIN_ROLES = [...CORE_ADMIN_ROLES, 'Admin Keuangan'];
export const FEATURE_FLAG_ROLES = ['Superadmin', 'Admin Ops'];
