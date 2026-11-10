import type { Language } from "./text";
const en = {
  title: "Stock counts awaiting review",
  ready: "Ready for review",
  stale: "New count required",
  recorded: "Recorded available",
  counted: "Counted available",
  difference: "Difference",
  current: "Current available",
  reason: "Count reason",
  reference: "Count evidence",
  selected: "Selected stock count",
  example: "Prepare fictional review queue example",
  exampleNote:
    "Creates two fictional pending counts: one ready for review and one made stale by a later stock receipt.",
  restricted: "Reviewer approval access is required for this queue.",
};
const es: typeof en = {
  title: "Recuentos pendientes de revisión",
  ready: "Listo para revisión",
  stale: "Se requiere nuevo recuento",
  recorded: "Disponible registrado",
  counted: "Disponible contado",
  difference: "Diferencia",
  current: "Disponible actual",
  reason: "Motivo del recuento",
  reference: "Evidencia del recuento",
  selected: "Recuento seleccionado",
  example: "Preparar ejemplo ficticio de cola de revisión",
  exampleNote:
    "Crea dos recuentos ficticios pendientes: uno vigente y otro desactualizado por una recepción posterior.",
  restricted: "Se requiere permiso de aprobación para esta cola.",
};
const fr: typeof en = {
  title: "Comptages en attente de revue",
  ready: "Prêt pour la revue",
  stale: "Nouveau comptage requis",
  recorded: "Disponible enregistré",
  counted: "Disponible compté",
  difference: "Différence",
  current: "Disponible actuel",
  reason: "Motif du comptage",
  reference: "Preuve du comptage",
  selected: "Comptage sélectionné",
  example: "Préparer un exemple fictif de file de revue",
  exampleNote:
    "Crée deux comptages fictifs en attente : un valide et un périmé par une réception ultérieure.",
  restricted: "Un droit d’approbation est requis pour cette file.",
};
export const reviewQueueLabels = (l: Language) => ({ en, es, fr })[l];
