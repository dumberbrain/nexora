/**
 * Runtime errors (T084). CapabilityUnsupportedError is declared next to the runtime contract in
 * ./runtime-adapter (lead-owned) and re-exported here; the HTTP error mapper turns it into
 * 422 CAPABILITY_UNSUPPORTED.
 */
export { CapabilityUnsupportedError } from "./runtime-adapter";
export { PathGuardError } from "../../lib/path-guard";
