import { type ApprovalListFilters } from "@/entities/approval";

/** GET /approvals?status=pending — the inbox key (loaders prefetch the same one). */
export const PENDING_APPROVALS: ApprovalListFilters = { status: "pending" };
