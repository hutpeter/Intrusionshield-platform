import type { Language } from "./text";
const en = {
  preview: "Assembly check — unsaved contents",
  frozen: "Checked against the captured tray template:",
  matched:
    "Required types and quantities match. Completion still requires confirmation and current eligibility checks.",
  blocked:
    "Completion blocked: resolve missing, excess or unexpected instruments. Unexpected types appear with Required 0.",
  unsaved:
    "This preview does not save or reserve instruments. You may save incomplete draft contents; completion remains blocked until they match.",
  unresolved:
    "Some selected instruments could not be loaded. Reload before saving.",
};
const es: typeof en = {
  preview: "Verificación del armado — contenido sin guardar",
  frozen: "Comparado con la plantilla capturada:",
  matched:
    "Los tipos y cantidades requeridos coinciden. Completar aún requiere confirmación y verificación de elegibilidad vigente.",
  blocked:
    "Completar bloqueado: resuelva instrumentos faltantes, sobrantes o inesperados. Los tipos inesperados muestran Requeridos 0.",
  unsaved:
    "Esta vista no guarda ni reserva instrumentos. Puede guardar un borrador incompleto; completarlo seguirá bloqueado hasta que coincida.",
  unresolved:
    "No se pudieron cargar algunos instrumentos seleccionados. Actualice antes de guardar.",
};
const fr: typeof en = {
  preview: "Contrôle de composition — contenu non enregistré",
  frozen: "Comparaison avec le modèle capturé :",
  matched:
    "Les types et quantités correspondent. Terminer exige encore une confirmation et les contrôles actuels d’admissibilité.",
  blocked:
    "Finalisation bloquée : corrigez les instruments manquants, excédentaires ou inattendus. Les types inattendus affichent Requis 0.",
  unsaved:
    "Cet aperçu n’enregistre ni ne réserve les instruments. Un brouillon incomplet peut être enregistré ; sa finalisation reste bloquée jusqu’à concordance.",
  unresolved:
    "Certains instruments sélectionnés n’ont pas pu être chargés. Actualisez avant d’enregistrer.",
};
export const assemblyCheckLabels = (language: Language) =>
  language === "es" ? es : language === "fr" ? fr : en;
