import type { Language } from "./text";
const en = {
  title: "Scan released package",
  identifier: "Storage and distribution package identifier",
  open: "Find released package",
  prepare: "Prepare fictional storage scan example",
  simulate: "Simulate storage scan",
  help: "Scanning checks current release, package version, recall, returns and issue status. Confirm storage or handover separately; scanning alone records no movement.",
  found: "Released package found — review and confirm the movement",
  INVALID_REQUEST: "Enter a complete Ruby RSP-P package identifier.",
  NOT_FOUND: "No matching package in this facility.",
  DISTRIBUTION_BLOCKED:
    "Package is not currently released, is already issued, or the label/release version changed.",
  RECALL_BLOCKED: "Package is blocked by a recall.",
  RETURN_BLOCKED: "Package has been returned and cannot be distributed.",
  error: "Lookup failed. No movement was recorded.",
};
const es: typeof en = {
  title: "Escanear paquete liberado",
  identifier: "Identificador de paquete para almacenamiento y distribución",
  open: "Buscar paquete liberado",
  prepare: "Preparar ejemplo ficticio de escaneo para almacenamiento",
  simulate: "Simular escaneo de almacenamiento",
  help: "El escaneo verifica liberación vigente, versión, retiradas, devoluciones y entrega. Confirme el almacenamiento o traspaso por separado; el escaneo no registra movimientos.",
  found: "Paquete liberado encontrado — revise y confirme el movimiento",
  INVALID_REQUEST: "Ingrese un identificador de paquete Ruby RSP-P completo.",
  NOT_FOUND: "No hay un paquete coincidente en este centro.",
  DISTRIBUTION_BLOCKED:
    "Paquete sin liberación vigente, ya entregado o con versión de etiqueta/liberación modificada.",
  RECALL_BLOCKED: "Paquete bloqueado por una retirada.",
  RETURN_BLOCKED: "Un paquete devuelto no puede distribuirse.",
  error: "Error de búsqueda. No se registró ningún movimiento.",
};
const fr: typeof en = {
  title: "Scanner un emballage libéré",
  identifier: "Identifiant d’emballage pour stockage et distribution",
  open: "Rechercher un emballage libéré",
  prepare: "Préparer un exemple fictif de lecture pour stockage",
  simulate: "Simuler une lecture pour stockage",
  help: "La lecture vérifie libération, version, rappels, retours et délivrance. Confirmez séparément stockage ou remise ; la lecture seule n’enregistre aucun mouvement.",
  found: "Emballage libéré trouvé — vérifiez et confirmez le mouvement",
  INVALID_REQUEST: "Saisissez un identifiant d’emballage Ruby RSP-P complet.",
  NOT_FOUND: "Aucun emballage correspondant dans cet établissement.",
  DISTRIBUTION_BLOCKED:
    "Emballage non libéré, déjà délivré ou version d’étiquette/libération modifiée.",
  RECALL_BLOCKED: "Emballage bloqué par un rappel.",
  RETURN_BLOCKED: "Un emballage retourné ne peut pas être distribué.",
  error: "Échec de recherche. Aucun mouvement enregistré.",
};
export const distributionScanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
