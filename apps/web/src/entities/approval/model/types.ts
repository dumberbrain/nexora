import { type ApprovalStatus } from "@nexora/contracts";

export type {
  ApprovalDecisionInput,
  ApprovalList,
  ApprovalRequest,
  ApprovalStatus,
} from "@nexora/contracts";

export interface ApprovalListFilters {
  status?: ApprovalStatus;
}
