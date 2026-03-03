import { requireAdminAccess } from "../../utils/admin-auth";

export default defineEventHandler((event) => {
  requireAdminAccess(event);
  return {
    success: true,
    mode: process.env.TENANT_CONFIG_PATH ? "path" : (process.env.TENANT_CONFIG_JSON ? "json" : "path-default"),
    tenantConfigPath: process.env.TENANT_CONFIG_PATH || "data/tenants.json",
  };
});
