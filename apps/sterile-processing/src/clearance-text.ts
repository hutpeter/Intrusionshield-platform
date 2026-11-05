import type { Language } from "./text";
const en = {
  clearanceEvent: "Recall clearance decision recorded",
  admissionEvent: "New receiving episode recorded",
  activeCycles: "A recorded sterilization cycle is still running",
  title: "Recall clearance and new receiving",
  example: "Prepare fictional recall clearance example",
  clear: "Record clearance for reprocessing",
  saveClear: "Save clearance decision",
  resolution: "Resolution / decision rationale",
  evidence: "Resolution evidence reference",
  procedure: "Approved reprocessing procedure",
  procedureVersion: "Procedure version",
  causeReviewed: "I reviewed the cause and resolution evidence.",
  recoveryReviewed: "I reviewed recovery and historical reconciliation.",
  dispositionReviewed: "I reviewed every disposition requiring reprocessing.",
  reprocessingRequired: "I require a new receiving and reprocessing episode.",
  confirmClear:
    "I authorize new reprocessing; old packages and labels remain invalid.",
  cleared: "Cleared for new reprocessing — old packages blocked",
  needed:
    "Clearance requires a closed, reconciled case with every item disposed as Reprocessing required. Older cases must first be extended to instrument blocking.",
  pending: "Instruments awaiting new receiving",
  admit: "Preview new receiving admission",
  saveAdmit: "Record new receiving episode",
  episodeCode: "New receiving episode code",
  custodian: "Receiving custodian",
  location: "Receiving / quarantine location",
  condition: "Received condition",
  reference: "Admission reference",
  note: "Observation (optional)",
  contentsChecked:
    "I confirm receipt of all instruments shown in this admission.",
  confirmAdmit:
    "I confirm this new receiving episode; fresh cleaning and inspection are required.",
  impact: "New receiving scope",
  otherCases: "Other recalls still require clearance",
  activeCleaning:
    "Cleaning must finish or be separately stopped before admission",
  complete: "New receiving recorded — continue in Receiving and cleaning",
  boundary:
    "Clearance permits fresh reprocessing, not clinical use or restoration of old stock. Closing alone does not lift holds. New incidents require a new recall.",
  versions: "Source records to close or supersede",
  supersede:
    "Previous receiving episodes retain their evidence and are marked superseded.",
  actor: "Recorded by",
  at: "Recorded at",
  saved: "Decision recorded.",
  instruments: "Instruments",
  cancel: "Cancel",
  newEpisode: "Linked receiving episode",
};
type Text = Record<keyof typeof en, string>;
const es: Text = {
  clearanceEvent: "Decisión de autorización tras retirada registrada",
  admissionEvent: "Nuevo episodio de recepción registrado",
  activeCycles: "Un ciclo de esterilización registrado sigue en curso",
  title: "Autorización tras retirada y nueva recepción",
  example: "Preparar ejemplo ficticio de autorización tras retirada",
  clear: "Registrar autorización para reprocesamiento",
  saveClear: "Guardar decisión de autorización",
  resolution: "Resolución / justificación",
  evidence: "Referencia de evidencia de resolución",
  procedure: "Procedimiento de reprocesamiento aprobado",
  procedureVersion: "Versión del procedimiento",
  causeReviewed: "Revisé la causa y la evidencia de resolución.",
  recoveryReviewed: "Revisé la recuperación y la conciliación histórica.",
  dispositionReviewed: "Revisé cada disposición que requiere reprocesamiento.",
  reprocessingRequired:
    "Exijo un nuevo episodio de recepción y reprocesamiento.",
  confirmClear:
    "Autorizo nuevo reprocesamiento; los paquetes y etiquetas anteriores siguen no válidos.",
  cleared: "Nuevo reprocesamiento autorizado — paquetes anteriores bloqueados",
  needed:
    "Se requiere un caso cerrado y conciliado, con cada disposición como Reprocesamiento requerido. Los casos antiguos deben ampliarse primero al bloqueo de instrumentos.",
  pending: "Instrumentos pendientes de nueva recepción",
  admit: "Revisar nueva admisión de recepción",
  saveAdmit: "Registrar nuevo episodio de recepción",
  episodeCode: "Código del nuevo episodio de recepción",
  custodian: "Responsable de recepción",
  location: "Ubicación de recepción / cuarentena",
  condition: "Condición recibida",
  reference: "Referencia de admisión",
  note: "Observación (opcional)",
  contentsChecked:
    "Confirmo la recepción de todos los instrumentos mostrados en esta admisión.",
  confirmAdmit:
    "Confirmo esta nueva recepción; se requieren limpieza e inspección nuevas.",
  impact: "Alcance de nueva recepción",
  otherCases: "Otras retiradas aún requieren autorización",
  activeCleaning:
    "La limpieza debe terminar o detenerse por separado antes de la admisión",
  complete: "Nueva recepción registrada — continúe en Recepción y limpieza",
  boundary:
    "La autorización permite nuevo reprocesamiento, no uso clínico ni restaurar existencias antiguas. Cerrar el caso no levanta retenciones. Los nuevos incidentes requieren otra retirada.",
  versions: "Registros de origen que se cerrarán o sustituirán",
  supersede:
    "Los episodios anteriores conservan sus evidencias y se marcan como sustituidos.",
  actor: "Registrado por",
  at: "Fecha de registro",
  saved: "Decisión registrada.",
  instruments: "Instrumentos",
  cancel: "Cancelar",
  newEpisode: "Episodio de recepción vinculado",
};
const fr: Text = {
  clearanceEvent: "Décision d’autorisation après rappel enregistrée",
  admissionEvent: "Nouvel épisode de réception enregistré",
  activeCycles: "Un cycle de stérilisation enregistré est encore en cours",
  title: "Autorisation après rappel et nouvelle réception",
  example: "Préparer un exemple fictif d’autorisation après rappel",
  clear: "Enregistrer l’autorisation de retraitement",
  saveClear: "Enregistrer la décision d’autorisation",
  resolution: "Résolution / justification",
  evidence: "Référence de preuve de résolution",
  procedure: "Procédure de retraitement approuvée",
  procedureVersion: "Version de procédure",
  causeReviewed: "J’ai examiné la cause et la preuve de résolution.",
  recoveryReviewed:
    "J’ai examiné la récupération et la réconciliation historique.",
  dispositionReviewed:
    "J’ai examiné chaque disposition exigeant un retraitement.",
  reprocessingRequired:
    "J’exige un nouvel épisode de réception et de retraitement.",
  confirmClear:
    "J’autorise un nouveau retraitement ; les anciens paquets et étiquettes restent invalides.",
  cleared: "Nouveau retraitement autorisé — anciens paquets bloqués",
  needed:
    "Le dossier doit être clos et réconcilié, chaque disposition étant Retraitement requis. Les anciens dossiers doivent d’abord être étendus au blocage des instruments.",
  pending: "Instruments en attente de nouvelle réception",
  admit: "Prévisualiser la nouvelle admission en réception",
  saveAdmit: "Enregistrer un nouvel épisode de réception",
  episodeCode: "Code du nouvel épisode de réception",
  custodian: "Responsable de réception",
  location: "Lieu de réception / quarantaine",
  condition: "État à la réception",
  reference: "Référence d’admission",
  note: "Observation (facultative)",
  contentsChecked:
    "Je confirme la réception de tous les instruments affichés dans cette admission.",
  confirmAdmit:
    "Je confirme cette nouvelle réception ; un nouveau nettoyage et une nouvelle inspection sont requis.",
  impact: "Périmètre de nouvelle réception",
  otherCases: "D’autres rappels exigent encore une autorisation",
  activeCleaning:
    "Le nettoyage doit terminer ou être arrêté séparément avant l’admission",
  complete:
    "Nouvelle réception enregistrée — continuez dans Réception et nettoyage",
  boundary:
    "L’autorisation permet un nouveau retraitement, ni l’usage clinique ni la restauration d’un ancien stock. Clôturer seul ne lève pas les retenues. Un nouvel incident exige un nouveau rappel.",
  versions: "Registres sources à clore ou remplacer",
  supersede:
    "Les épisodes précédents conservent leurs preuves et sont marqués remplacés.",
  actor: "Enregistré par",
  at: "Date d’enregistrement",
  saved: "Décision enregistrée.",
  instruments: "Instruments",
  cancel: "Annuler",
  newEpisode: "Épisode de réception lié",
};
export const clearanceLabels = (language: Language) =>
  language === "es" ? es : language === "fr" ? fr : en;
