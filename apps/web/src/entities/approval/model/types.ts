import { type ApprovalStatus } from "@ubuliera/contracts";

export type {
  ApprovalDecisionInput,
  ApprovalList,
  ApprovalRequest,
  ApprovalStatus,
} from "@ubuliera/contracts";

export interface ApprovalListFilters {
  status?: ApprovalStatus;
}
