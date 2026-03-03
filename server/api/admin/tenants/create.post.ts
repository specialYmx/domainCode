import { createError } from "h3";
import { requireAdminAccess } from "../../../utils/admin-auth";
import { createTenant } from "../../../utils/tenant-admin";

interface CreateTenantBody {
  email?: string;
  tenantId?: string;
  displayName?: string;
  accessKey?: string;
}

export default defineEventHandler(async (event) => {
  requireAdminAccess(event);

  const body = await readBody<CreateTenantBody>(event);
  const email = body?.email?.trim() || "";
  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "email is required",
    });
  }

  try {
    const created = createTenant({
      email,
      tenantId: body?.tenantId,
      displayName: body?.displayName,
      accessKey: body?.accessKey,
    });

    return {
      success: true,
      tenant: {
        id: created.id,
        displayName: created.displayName,
        recipients: created.recipients,
      },
      accessKey: created.accessKey,
      file: created.file,
    };
  } catch (error: any) {
    const message = error?.message || "Failed to create tenant";
    const statusCode = message.includes("already exists") ? 409 : 400;
    throw createError({
      statusCode,
      statusMessage: statusCode === 409 ? "Conflict" : "Bad Request",
      message,
    });
  }
});
