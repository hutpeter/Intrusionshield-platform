const es = {
  PROCEDURE_BLOCKED:
    "La revisión no está publicada o no corresponde a la etapa, método o tipos de instrumental. Revise su selección.",
  LOANER_UNAVAILABLE:
    "Conjunto prestado no disponible. Revise contenido, procesamiento, custodia y retenciones antes de la devolución al proveedor.",
  SERVICE_DUE:
    "Instrumento con servicio vencido: no se permite un nuevo armado o empaque. Complete el mantenimiento autorizado.",
  RETURN_CONTENTS_MISMATCH:
    "El contenido declarado no coincide con la operación. Revise los recibidos y faltantes; use el registro de discrepancia para una devolución parcial.",
  SCAN_DUPLICATE: "Este instrumento ya está asignado a la bandeja.",
  SCAN_TYPE: "El tipo no corresponde o su cantidad requerida ya está cubierta.",
  SCAN_INELIGIBLE: "El instrumento está retirado o retenido por mantenimiento.",
  CLEARANCE_BLOCKED:
    "Revise la conciliación, disposición para reprocesamiento, otras retiradas y la limpieza en curso antes de continuar.",
  RECALL_LIMIT:
    "El alcance supera el límite de esta vista previa. No registre una retirada parcial; solicite una revisión completa.",
  TRACE_LIMIT:
    "El historial supera el límite del informe. Busque un instrumento o paquete más específico.",
  RETURN_BLOCKED:
    "El paquete devuelto permanece bloqueado. Revise su disposición.",
  RECALL_BLOCKED:
    "El paquete está bloqueado por una retirada. Revise el caso; no se permite esta operación.",
  DISTRIBUTION_BLOCKED:
    "El paquete no tiene una liberación vigente aplicable. Revise su carga y decisión antes de moverlo.",
  REVIEW_BLOCKED:
    "Revise el ciclo, las evidencias, los paquetes y la identidad del revisor. No se permite esta liberación.",
  LOAD_BLOCKED:
    "Revise los paquetes y cualquier carga activa antes de continuar.",
  PACKAGING_BLOCKED:
    "Revise el armado completo, sus inspecciones previas y cualquier paquete activo antes de continuar.",
  PROCESSING_HOLD:
    "El instrumento está retenido en recepción, limpieza o inspección pendiente.",
  title: "Procesamiento estéril y gestión de instrumental",
  instrumentTypes: "Tipos de instrumental",
  instruments: "Instrumentos",
  register: "Registrar instrumento",
  retire: "Retirar del servicio",
  code: "Código",
  name: "Nombre",
  manufacturer: "Fabricante",
  model: "Modelo",
  serialNumber: "Número de serie",
  reason: "Motivo",
  page: "Página",
  registered: "Registrado — no liberado para uso clínico",
  retired: "Retirado del servicio",
  ASSEMBLY_INCOMPLETE:
    "La composición no coincide: revise los instrumentos faltantes o sobrantes.",
  INSTRUMENT_ASSIGNED:
    "El instrumento no está disponible o está asignado a un armado activo. Revise el armado antes de continuar.",
  INVALID_REQUEST: "Revise los datos ingresados.",
  NOT_FOUND: "Registro no encontrado.",
  CONFLICT: "El registro cambió o el código ya existe. Recargue y verifique.",
  UNAUTHENTICATED: "Inicie sesión para continuar.",
  FORBIDDEN: "No tiene autorización para esta acción.",
  SERVICE_UNAVAILABLE: "Servicio no disponible. No se ha confirmado el cambio.",
};
type Messages = Record<keyof typeof es, string>;
const en: Messages = {
  PROCEDURE_BLOCKED:
    "The revision is unpublished, withdrawn or does not match this stage, method or instrument types. Review the selection.",
  LOANER_UNAVAILABLE:
    "Loaner set unavailable. Reconcile contents, processing, custody and holds before supplier hand-back.",
  SERVICE_DUE:
    "Instrument service is due: new assembly or packaging is blocked. Complete authorized maintenance.",
  RETURN_CONTENTS_MISMATCH:
    "Declared contents do not match this operation. Review received and missing items; use discrepancy recording for a partial return.",
  SCAN_DUPLICATE: "This instrument is already assigned to the tray.",
  SCAN_TYPE:
    "Instrument type does not match or its required quantity is already filled.",
  SCAN_INELIGIBLE: "The instrument is retired or held for maintenance.",
  CLEARANCE_BLOCKED:
    "Review reconciliation, reprocessing disposition, other recalls and any cleaning in progress before continuing.",
  RECALL_LIMIT:
    "The impact exceeds this preview limit. Do not record a partial recall; arrange a full scope review.",
  TRACE_LIMIT:
    "The history exceeds the report limit. Search for a more specific instrument or package.",
  RETURN_BLOCKED:
    "The returned package remains blocked. Review its disposition.",
  RECALL_BLOCKED:
    "The package is blocked by a recall. Review the case; this operation is not permitted.",
  DISTRIBUTION_BLOCKED:
    "The package has no applicable current release. Review its load and decision before moving it.",
  REVIEW_BLOCKED:
    "Review the cycle, evidence, packages and reviewer identity. This release is not permitted.",
  LOAD_BLOCKED: "Review the packages and any active load before continuing.",
  PACKAGING_BLOCKED:
    "Review the completed assembly, prior inspections and any active package before continuing.",
  PROCESSING_HOLD:
    "The instrument is held for receiving, cleaning or pending inspection.",
  title: "Sterile Processing & Instrument Management",
  instrumentTypes: "Instrument types",
  instruments: "Instruments",
  register: "Register instrument",
  retire: "Retire instrument",
  code: "Code",
  name: "Name",
  manufacturer: "Manufacturer",
  model: "Model",
  serialNumber: "Serial number",
  reason: "Reason",
  page: "Page",
  registered: "Registered — not released for clinical use",
  retired: "Retired",
  ASSEMBLY_INCOMPLETE:
    "The contents do not match: review missing or excess instruments.",
  INSTRUMENT_ASSIGNED:
    "The instrument is unavailable or assigned to an active assembly. Review its assembly before continuing.",
  INVALID_REQUEST: "Check the entered details.",
  NOT_FOUND: "Record not found.",
  CONFLICT: "The record changed or the code already exists. Reload and verify.",
  UNAUTHENTICATED: "Sign in to continue.",
  FORBIDDEN: "You are not authorized for this action.",
  SERVICE_UNAVAILABLE:
    "Service unavailable. The change has not been confirmed.",
};
const fr: Messages = {
  PROCEDURE_BLOCKED:
    "Révision non publiée, retirée ou incompatible avec l’étape, méthode ou types d’instruments. Vérifiez la sélection.",
  LOANER_UNAVAILABLE:
    "Ensemble prêté indisponible. Rapprochez contenu, traitement, garde et blocages avant remise au fournisseur.",
  SERVICE_DUE:
    "Entretien requis : nouvel assemblage ou emballage bloqué. Effectuez la maintenance autorisée.",
  RETURN_CONTENTS_MISMATCH:
    "Le contenu déclaré ne correspond pas à cette opération. Vérifiez les reçus et manquants ; utilisez l’enregistrement d’écart pour un retour partiel.",
  SCAN_DUPLICATE: "Cet instrument est déjà affecté au plateau.",
  SCAN_TYPE: "Type incompatible ou quantité requise déjà atteinte.",
  SCAN_INELIGIBLE: "Instrument retiré ou bloqué pour maintenance.",
  CLEARANCE_BLOCKED:
    "Vérifiez la réconciliation, la disposition pour retraitement, les autres rappels et tout nettoyage en cours avant de continuer.",
  RECALL_LIMIT:
    "Le périmètre dépasse la limite de cette prévisualisation. N’enregistrez pas un rappel partiel ; demandez une révision complète.",
  TRACE_LIMIT:
    "L’historique dépasse la limite du rapport. Recherchez un instrument ou paquet plus précis.",
  RETURN_BLOCKED: "Le paquet retourné reste bloqué. Consultez sa disposition.",
  RECALL_BLOCKED:
    "L’emballage est bloqué par un rappel. Consultez le dossier ; cette opération est interdite.",
  DISTRIBUTION_BLOCKED:
    "L’emballage n’a pas de libération actuelle applicable. Vérifiez la charge et la décision avant tout mouvement.",
  REVIEW_BLOCKED:
    "Vérifiez le cycle, les preuves, les emballages et l’identité du réviseur. Cette libération est interdite.",
  LOAD_BLOCKED:
    "Vérifiez les emballages et toute charge active avant de continuer.",
  PACKAGING_BLOCKED:
    "Vérifiez l’assemblage complet, les inspections antérieures et tout emballage actif avant de continuer.",
  PROCESSING_HOLD:
    "L’instrument est retenu en réception, nettoyage ou attente d’inspection.",
  title: "Stérilisation et gestion des instruments",
  instrumentTypes: "Types d’instruments",
  instruments: "Instruments",
  register: "Enregistrer un instrument",
  retire: "Retirer du service",
  code: "Code",
  name: "Nom",
  manufacturer: "Fabricant",
  model: "Modèle",
  serialNumber: "Numéro de série",
  reason: "Motif",
  page: "Page",
  registered: "Enregistré — non libéré pour un usage clinique",
  retired: "Retiré du service",
  ASSEMBLY_INCOMPLETE:
    "La composition ne correspond pas : vérifiez les instruments manquants ou en trop.",
  INSTRUMENT_ASSIGNED:
    "L’instrument est indisponible ou affecté à un assemblage actif. Vérifiez cet assemblage avant de continuer.",
  INVALID_REQUEST: "Vérifiez les données saisies.",
  NOT_FOUND: "Enregistrement introuvable.",
  CONFLICT:
    "L’enregistrement a changé ou le code existe déjà. Rechargez et vérifiez.",
  UNAUTHENTICATED: "Connectez-vous pour continuer.",
  FORBIDDEN: "Vous n’êtes pas autorisé à effectuer cette action.",
  SERVICE_UNAVAILABLE:
    "Service indisponible. La modification n’a pas été confirmée.",
};
export const sterileCatalogues = Object.freeze({
  es: Object.freeze(es),
  en: Object.freeze(en),
  fr: Object.freeze(fr),
});
export function sterileMessages(locale = "es-PE"): Readonly<Messages> {
  const language = locale.toLowerCase().split("-")[0];
  return (
    sterileCatalogues[language as keyof typeof sterileCatalogues] ??
    sterileCatalogues.es
  );
}
