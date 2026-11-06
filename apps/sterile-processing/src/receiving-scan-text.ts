import type { Language } from "./text";
const en = {
  title: "Scan into receiving list",
  identifier: "Receiving instrument scan identifier",
  add: "Scan and add to receiving list",
  simulate: "Simulate receiving scan",
  prepare: "Prepare fictional receiving scan example",
  help: "Scanning stages an instrument only. Review the receiving details and confirm receipt to save; custody and holds are rechecked then. Enter in this scan field adds to the list, not the receipt.",
  staged: "Instrument added to receiving list — receipt not saved",
  recorded: "Internal identifiers recorded at receiving",
  SCAN_DUPLICATE: "This instrument is already in the receiving list.",
  SCAN_INELIGIBLE: "The instrument is retired or held for maintenance.",
  PROCESSING_HOLD:
    "This instrument already belongs to a receiving or processing episode.",
  INSTRUMENT_ASSIGNED: "Reconcile the active tray or package custody first.",
  RECALL_BLOCKED:
    "This instrument is blocked by a recall. Use its authorized clearance workflow.",
  INVALID_REQUEST: "Enter a complete Ruby RSP-I identifier.",
  NOT_FOUND: "No matching instrument in this facility.",
  limit: "A receiving episode accepts at most 100 instruments.",
  error:
    "The scan was not added. Check the identifier and current instrument state.",
};
const es: typeof en = {
  title: "Escanear a la lista de recepción",
  identifier: "Identificador de escaneo para recepción",
  add: "Escanear y añadir a recepción",
  simulate: "Simular escaneo de recepción",
  prepare: "Preparar ejemplo ficticio de escaneo de recepción",
  help: "El escaneo solo prepara la lista. Revise los datos y confirme la recepción para guardar; se verifican nuevamente la custodia y las retenciones. Intro en este campo añade a la lista, no guarda la recepción.",
  staged: "Instrumento añadido a la lista — recepción sin guardar",
  recorded: "Identificadores internos registrados en recepción",
  SCAN_DUPLICATE: "Este instrumento ya está en la lista de recepción.",
  SCAN_INELIGIBLE: "El instrumento está retirado o retenido por mantenimiento.",
  PROCESSING_HOLD: "Este instrumento ya pertenece a una recepción o proceso.",
  INSTRUMENT_ASSIGNED:
    "Concilie primero la custodia de la bandeja o paquete activo.",
  RECALL_BLOCKED:
    "Instrumento bloqueado por retirada. Use su flujo de autorización.",
  INVALID_REQUEST: "Ingrese un identificador Ruby RSP-I completo.",
  NOT_FOUND: "No hay un instrumento coincidente en este centro.",
  limit: "Una recepción admite un máximo de 100 instrumentos.",
  error:
    "No se añadió el escaneo. Revise el identificador y el estado vigente.",
};
const fr: typeof en = {
  title: "Scanner dans la liste de réception",
  identifier: "Identifiant de lecture pour réception",
  add: "Scanner et ajouter à la réception",
  simulate: "Simuler une lecture de réception",
  prepare: "Préparer un exemple fictif de lecture de réception",
  help: "La lecture prépare seulement la liste. Vérifiez les détails et confirmez la réception pour enregistrer ; garde et blocages sont revérifiés. Entrée dans ce champ ajoute à la liste sans enregistrer la réception.",
  staged: "Instrument ajouté à la liste — réception non enregistrée",
  recorded: "Identifiants internes enregistrés à la réception",
  SCAN_DUPLICATE: "Cet instrument figure déjà dans la liste de réception.",
  SCAN_INELIGIBLE: "Instrument retiré ou bloqué pour maintenance.",
  PROCESSING_HOLD:
    "Cet instrument appartient déjà à une réception ou un traitement.",
  INSTRUMENT_ASSIGNED:
    "Réconciliez d’abord la garde du plateau ou emballage actif.",
  RECALL_BLOCKED:
    "Instrument bloqué par un rappel. Utilisez son autorisation dédiée.",
  INVALID_REQUEST: "Saisissez un identifiant Ruby RSP-I complet.",
  NOT_FOUND: "Aucun instrument correspondant dans cet établissement.",
  limit: "Une réception accepte au maximum 100 instruments.",
  error: "Lecture non ajoutée. Vérifiez l’identifiant et l’état actuel.",
};
export const receivingScanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
