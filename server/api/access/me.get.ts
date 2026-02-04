import { requireTenant } from "../../utils/auth";

export default defineEventHandler((event) => {
  try {
    const tenant = requireTenant(event);
    return {
      authenticated: true,
      tenantId: tenant.id,
      displayName: tenant.displayName || tenant.id,
      recipients: tenant.recipients,
    };
  } catch {
    return {
      authenticated: false,
      tenantId: null,
      displayName: null,
      recipients: [],
    };
  }
});
