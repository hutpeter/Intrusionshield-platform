import type { ProcessingEpisode } from "./processing-types.js";
/** Linked admissions must be resolved through their source workflow. */
export function receiptCanBeCancelled(record: ProcessingEpisode): boolean {
  return (
    record.state === "received" &&
    !record.attempts.length &&
    !record.inspections?.length &&
    !record.returnSource &&
    !record.recallSource &&
    !record.maintenanceSource &&
    !record.loanerSource &&
    !record.supersededBy
  );
}
