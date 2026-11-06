import type { Language } from "./text";
const en = {
  title: "Scan issued package for return",
  identifier: "Return package scan identifier",
  open: "Find issued package",
  prepare: "Prepare fictional return scan example",
  simulate: "Simulate return scan",
  help: "Scanning retrieves the original issue and contents. Review the returned condition and quarantine location, reconcile all contents and confirm return separately.",
  manifest: "Original package contents",
  discrepancy: "Contents are missing or do not match the original package.",
  blocked:
    "Contents discrepancy — select the expected instruments actually received and save a confirmed discrepancy. The package remains blocked.",
  recall:
    "A recall applies. Recording return does not lift the hold or authorize reprocessing.",
  recorded: "Internal identifier and returned contents recorded",
  RETURN_BLOCKED:
    "Package was not issued or already has a return. Open the existing return record if needed.",
  INVALID_REQUEST: "Enter a complete Ruby RSP-P package identifier.",
  NOT_FOUND: "No matching package in this facility.",
  CONFLICT:
    "The package or issue changed. Reload and scan the current identifier.",
  error: "Lookup failed. No return was recorded.",
};
const es: typeof en = {
  title: "Escanear paquete entregado para devolución",
  identifier: "Identificador de paquete para devolución",
  open: "Buscar paquete entregado",
  prepare: "Preparar ejemplo ficticio de escaneo de devolución",
  simulate: "Simular escaneo de devolución",
  help: "El escaneo recupera la entrega original y el contenido. Revise la condición y ubicación de cuarentena, concilie todo el contenido y confirme la devolución por separado.",
  manifest: "Contenido original del paquete",
  discrepancy: "Falta contenido o no coincide con el paquete original.",
  blocked:
    "Discrepancia de contenido — seleccione los instrumentos esperados realmente recibidos y guarde una discrepancia confirmada. El paquete sigue bloqueado.",
  recall:
    "Existe una retirada. Registrar la devolución no levanta la retención ni autoriza reprocesamiento.",
  recorded: "Identificador interno y contenido devuelto registrados",
  RETURN_BLOCKED:
    "Paquete no entregado o ya devuelto. Abra el registro existente si corresponde.",
  INVALID_REQUEST: "Ingrese un identificador de paquete Ruby RSP-P completo.",
  NOT_FOUND: "No hay un paquete coincidente en este centro.",
  CONFLICT:
    "El paquete o la entrega cambió. Actualice y escanee el identificador vigente.",
  error: "Error de búsqueda. No se registró ninguna devolución.",
};
const fr: typeof en = {
  title: "Scanner un emballage délivré pour retour",
  identifier: "Identifiant d’emballage pour retour",
  open: "Rechercher un emballage délivré",
  prepare: "Préparer un exemple fictif de lecture de retour",
  simulate: "Simuler une lecture de retour",
  help: "La lecture retrouve la remise originale et son contenu. Vérifiez état et lieu de quarantaine, réconciliez tout le contenu puis confirmez séparément le retour.",
  manifest: "Contenu original de l’emballage",
  discrepancy: "Contenu manquant ou différent de l’emballage original.",
  blocked:
    "Écart de contenu — sélectionnez les instruments attendus réellement reçus et enregistrez un écart confirmé. Le paquet reste bloqué.",
  recall:
    "Un rappel s’applique. Enregistrer le retour ne lève pas le blocage et n’autorise pas le retraitement.",
  recorded: "Identifiant interne et contenu retourné enregistrés",
  RETURN_BLOCKED:
    "Emballage non délivré ou déjà retourné. Ouvrez le retour existant si nécessaire.",
  INVALID_REQUEST: "Saisissez un identifiant d’emballage Ruby RSP-P complet.",
  NOT_FOUND: "Aucun emballage correspondant dans cet établissement.",
  CONFLICT:
    "Emballage ou remise modifié. Rechargez et scannez l’identifiant actuel.",
  error: "Échec de recherche. Aucun retour enregistré.",
};
export const returnScanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
