import { createError, type H3Event } from "h3";
import { getSessionTenantId } from "./session";
import { getTenantById, type TenantConfig } from "./tenant";

export function requireTenant(event: H3Event): TenantConfig {
  const tenantId = getSessionTenantId(event);
  if (!tenantId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "Access code required",
    });
  }

  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "Access code expired",
    });
  }

  return tenant;
}
