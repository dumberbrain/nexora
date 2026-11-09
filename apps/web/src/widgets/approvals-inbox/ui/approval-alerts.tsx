import { useApprovalAlerts } from "../model/use-approval-alerts";

/** Renders nothing; mount once in the app shell so approval toasts show on every page. */
export function ApprovalAlerts() {
  useApprovalAlerts();
  return null;
}
