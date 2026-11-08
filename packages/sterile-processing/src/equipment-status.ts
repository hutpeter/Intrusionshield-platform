import type { ProcessingEquipment } from "./equipment.js";
export function equipmentStatus(
  record: ProcessingEquipment,
  now = Date.now(),
): "out_of_service" | "service_overdue" | "qualification_overdue" | "ready" {
  if (record.state !== "in_service") return "out_of_service";
  if (
    !Number.isFinite(Date.parse(record.serviceDueAt)) ||
    Date.parse(record.serviceDueAt) <= now
  )
    return "service_overdue";
  if (
    !Number.isFinite(Date.parse(record.qualificationDueAt)) ||
    Date.parse(record.qualificationDueAt) <= now
  )
    return "qualification_overdue";
  return "ready";
}
