const es = {
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
