import type { ProcessingEpisode } from "@intrusionshield/sterile-processing";
export const receiptDetailFields = [
  "source",
  "custodian",
  "condition",
  "discrepancies",
] as const;
export function receiptHasChanges(
  record: ProcessingEpisode,
  fields: Pick<ProcessingEpisode, (typeof receiptDetailFields)[number]>,
) {
  return receiptDetailFields.some(
    (key) => fields[key].trim().normalize("NFC") !== record[key],
  );
}
export function receiptCanBeCorrected(record: ProcessingEpisode) {
  return (
    record.state === "received" &&
    record.attempts.length === 0 &&
    !record.inspections?.length &&
    (record.receiptCorrections?.length ?? 0) < 50
  );
}
export const receiptCorrectionText = {
  en: {
    title: "Correct receipt details",
    reason: "Correction reason",
    reference: "Correction reference",
    confirm: "I confirm this clerical correction; instruments remain held.",
    save: "Save correction",
    boundary:
      "Correct receiving details before cleaning starts. The original version and all holds are retained.",
    history: "Receipt details corrected",
  },
  es: {
    title: "Corregir datos de recepción",
    reason: "Motivo de la corrección",
    reference: "Referencia de la corrección",
    confirm:
      "Confirmo esta corrección administrativa; el instrumental sigue retenido.",
    save: "Guardar corrección",
    boundary:
      "Corrija los datos antes de iniciar la limpieza. Se conservan la versión original y las retenciones.",
    history: "Datos de recepción corregidos",
  },
  fr: {
    title: "Corriger la réception",
    reason: "Motif de la correction",
    reference: "Référence de la correction",
    confirm:
      "Je confirme cette correction administrative ; les instruments restent bloqués.",
    save: "Enregistrer la correction",
    boundary:
      "Corrigez les détails avant le nettoyage. La version originale et les blocages sont conservés.",
    history: "Détails de réception corrigés",
  },
};

export const receiptCancellationText = {
  en: {
    title: "Cancel receipt",
    reason: "Cancellation reason",
    reference: "Cancellation reference",
    confirm: "I confirm cancellation of this mistaken receipt.",
    save: "Confirm receipt cancellation",
    boundary:
      "Permanent cancellation before cleaning. This receipt’s receiving holds are removed; recall and incident blocks remain. This does not record cleaning or authorize use. Linked admissions must be resolved through their source workflow.",
    history: "Receipt cancelled",
  },
  es: {
    title: "Anular recepción",
    reason: "Motivo de anulación",
    reference: "Referencia de anulación",
    confirm: "Confirmo la anulación de esta recepción errónea.",
    save: "Confirmar anulación de recepción",
    boundary:
      "Anulación permanente antes de la limpieza. Solo se eliminan las retenciones de esta recepción; se conservan los bloqueos de retirada e incidente. No registra limpieza ni autoriza el uso. Las admisiones vinculadas requieren su flujo de origen.",
    history: "Recepción anulada",
  },
  fr: {
    title: "Annuler la réception",
    reason: "Motif d’annulation",
    reference: "Référence d’annulation",
    confirm: "Je confirme l’annulation de cette réception erronée.",
    save: "Confirmer l’annulation de réception",
    boundary:
      "Annulation permanente avant nettoyage. Seuls les blocages de cette réception sont supprimés ; les rappels et incidents restent bloqués. Aucun nettoyage ni usage n’est autorisé. Les admissions liées exigent leur procédure d’origine.",
    history: "Réception annulée",
  },
};
