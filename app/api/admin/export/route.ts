import { getCurrentUser, getD1, isAdmin, json } from "../../../lib/data";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!isAdmin(user)) return json({ error: "Admin access required." }, 403);

  const rows = await getD1()
    .prepare(
      "SELECT users.id, users.email, users.username, users.role, users.created_at as registeredAt, entitlements.kind, entitlements.app_id as appId, entitlements.status as entitlementStatus, entitlements.provider, entitlements.current_period_end as currentPeriodEnd, entitlements.created_at as entitlementCreatedAt FROM users LEFT JOIN entitlements ON entitlements.user_id = users.id ORDER BY users.created_at DESC, entitlements.created_at DESC",
    )
    .all<Record<string, unknown>>();

  const headers = [
    "id",
    "email",
    "username",
    "role",
    "registeredAt",
    "kind",
    "appId",
    "entitlementStatus",
    "provider",
    "currentPeriodEnd",
    "entitlementCreatedAt",
  ];
  const body = [
    headers.join(","),
    ...((rows.results || []) as Record<string, unknown>[]).map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="steam-guardrail-users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
