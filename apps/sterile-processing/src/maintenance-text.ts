import type { Language } from "./text";
const en = {
  title: "Maintenance and repair",
  hold: "Maintenance hold — unavailable",
  report: "Report defect and hold",
  assess: "Record assessment",
  repair: "Record repair evidence",
  authorize: "Authorize fresh processing",
  defect: "Defect / reason",
  location: "Quarantine / receiving location",
  note: "Assessment / repair details",
  evidence: "Evidence reference",
  provider: "Service provider",
  reason: "Authorization rationale",
  procedure: "Reprocessing procedure",
  procedureVersion: "Procedure version",
  code: "New receiving code",
  custodian: "Receiving custodian",
  functionalChecked:
    "I reviewed the repair evidence and functional verification.",
  confirmed: "I confirm this record.",
  save: "Save maintenance record",
  cancel: "Cancel",
  help: "For instruments outside active trays and processing. Existing custody must be reconciled first. Repair never restores clinical availability; authorization creates fresh receiving.",
  blocked:
    "Reconcile active tray, processing or recall restrictions before continuing.",
  returned: "Authorized — fresh receiving required",
  episode: "Linked fresh receiving episode",
  prepare: "Prepare fictional maintenance instrument",
  error:
    "Unable to save. Check required fields and current instrument status; reload after a conflict.",
  reported: "Defect recorded",
  assessed: "Assessment recorded",
  repaired: "Repair evidence recorded",
  authorized: "Fresh processing authorized",
  empty: "No maintenance records.",
  at: "Recorded",
  actor: "Actor",
};
const es: typeof en = {
  title: "Mantenimiento y reparación",
  hold: "Retenido por mantenimiento — no disponible",
  report: "Registrar defecto y retener",
  assess: "Registrar evaluación",
  repair: "Registrar evidencia de reparación",
  authorize: "Autorizar nuevo reprocesamiento",
  defect: "Defecto / motivo",
  location: "Ubicación de cuarentena / recepción",
  note: "Detalles de evaluación / reparación",
  evidence: "Referencia de evidencia",
  provider: "Proveedor del servicio",
  reason: "Justificación de autorización",
  procedure: "Procedimiento de reprocesamiento",
  procedureVersion: "Versión del procedimiento",
  code: "Código de nueva recepción",
  custodian: "Responsable de recepción",
  functionalChecked:
    "Revisé la evidencia de reparación y la verificación funcional.",
  confirmed: "Confirmo este registro.",
  save: "Guardar registro de mantenimiento",
  cancel: "Cancelar",
  help: "Para instrumentos fuera de bandejas y procesos activos. Primero concilie la custodia vigente. La reparación no restablece disponibilidad clínica; la autorización crea una nueva recepción.",
  blocked:
    "Concilie las restricciones de bandeja, proceso o retiro antes de continuar.",
  returned: "Autorizado — requiere nueva recepción",
  episode: "Nueva recepción vinculada",
  prepare: "Preparar instrumento ficticio de mantenimiento",
  error:
    "No se pudo guardar. Verifique los campos y el estado del instrumento; actualice tras un conflicto.",
  reported: "Defecto registrado",
  assessed: "Evaluación registrada",
  repaired: "Evidencia de reparación registrada",
  authorized: "Nuevo reprocesamiento autorizado",
  empty: "Sin registros de mantenimiento.",
  at: "Fecha de registro",
  actor: "Usuario",
};
const fr: typeof en = {
  title: "Maintenance et réparation",
  hold: "Blocage de maintenance — indisponible",
  report: "Signaler un défaut et bloquer",
  assess: "Enregistrer une évaluation",
  repair: "Enregistrer la preuve de réparation",
  authorize: "Autoriser un nouveau traitement",
  defect: "Défaut / motif",
  location: "Lieu de quarantaine / réception",
  note: "Détails de l’évaluation / réparation",
  evidence: "Référence de preuve",
  provider: "Prestataire",
  reason: "Motif de l’autorisation",
  procedure: "Procédure de retraitement",
  procedureVersion: "Version de procédure",
  code: "Code de nouvelle réception",
  custodian: "Responsable de réception",
  functionalChecked:
    "J’ai vérifié les preuves de réparation et le contrôle fonctionnel.",
  confirmed: "Je confirme cet enregistrement.",
  save: "Enregistrer la maintenance",
  cancel: "Annuler",
  help: "Pour les instruments hors plateaux et traitements actifs. Réconciliez d’abord la garde actuelle. La réparation ne rétablit pas la disponibilité clinique ; l’autorisation crée une nouvelle réception.",
  blocked:
    "Réconciliez les restrictions de plateau, de traitement ou de rappel avant de poursuivre.",
  returned: "Autorisé — nouvelle réception requise",
  episode: "Nouvelle réception liée",
  prepare: "Préparer un instrument fictif de maintenance",
  error:
    "Enregistrement impossible. Vérifiez les champs et l’état actuel ; rechargez après un conflit.",
  reported: "Défaut enregistré",
  assessed: "Évaluation enregistrée",
  repaired: "Preuve de réparation enregistrée",
  authorized: "Nouveau traitement autorisé",
  empty: "Aucun enregistrement de maintenance.",
  at: "Date",
  actor: "Acteur",
};
export const maintenanceLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
export const maintenanceEvent = (action: string, l: Language) => {
  const t = maintenanceLabels(l);
  return (
    {
      "maintenance-reported": t.reported,
      "maintenance-assessed": t.assessed,
      "maintenance-repaired": t.repaired,
      "maintenance-authorized": t.authorized,
    } as Record<string, string>
  )[action];
};
