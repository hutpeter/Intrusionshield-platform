import type { Language } from "./text";
const en = {
  title: "Scan package into draft load",
  identifier: "Package scan identifier",
  confirm: "I confirm this package is being placed in this load.",
  add: "Scan and add package",
  simulate: "Simulate package scan",
  prepare: "Prepare fictional package load scan example",
  help: "A confirmed scan saves one package to this draft. Current package version, recall, returns and load custody are rechecked. Starting the cycle remains a separate confirmation.",
  added: "Package added by scan",
  SCAN_DUPLICATE: "This package is already in the load.",
  INVALID_REQUEST:
    "Enter a complete Ruby RSP-P identifier and confirm placement.",
  NOT_FOUND: "Package or load not found in this facility.",
  CONFLICT:
    "The load or package version changed. Reload and use the current package label.",
  LOAD_BLOCKED:
    "Package is voided, no longer active or assigned to another load.",
  RECALL_BLOCKED: "A package is blocked by a recall. Review its case.",
  RETURN_BLOCKED: "A package has been returned and cannot be loaded again.",
  error:
    "The addition was not confirmed. Check the current load and package before retrying.",
  dataMatrix: "Data Matrix for Ruby package identifier",
  generating: "Generating package Data Matrix…",
  renderError: "Package symbol could not be generated. Reload before printing.",
};
const es: typeof en = {
  title: "Escanear paquete a carga en borrador",
  identifier: "Identificador de escaneo del paquete",
  confirm: "Confirmo que este paquete se coloca en esta carga.",
  add: "Escanear y añadir paquete",
  simulate: "Simular escaneo de paquete",
  prepare: "Preparar ejemplo ficticio de escaneo de paquete a carga",
  help: "Un escaneo confirmado guarda un paquete en este borrador. Se verifican versión vigente, retiradas, devoluciones y custodia. El inicio del ciclo requiere otra confirmación.",
  added: "Paquete añadido por escaneo",
  SCAN_DUPLICATE: "Este paquete ya está en la carga.",
  INVALID_REQUEST:
    "Ingrese un identificador Ruby RSP-P completo y confirme la colocación.",
  NOT_FOUND: "Paquete o carga no encontrado en este centro.",
  CONFLICT:
    "Cambió la versión de la carga o del paquete. Actualice y use la etiqueta vigente.",
  LOAD_BLOCKED: "Paquete anulado, inactivo o asignado a otra carga.",
  RECALL_BLOCKED: "Un paquete está bloqueado por retirada. Revise el caso.",
  RETURN_BLOCKED: "Un paquete devuelto no puede cargarse nuevamente.",
  error:
    "La adición no fue confirmada. Revise el estado vigente antes de reintentar.",
  dataMatrix: "Data Matrix del identificador de paquete Ruby",
  generating: "Generando Data Matrix del paquete…",
  renderError: "No se pudo generar el símbolo. Actualice antes de imprimir.",
};
const fr: typeof en = {
  title: "Scanner un emballage dans une charge en brouillon",
  identifier: "Identifiant de lecture de l’emballage",
  confirm: "Je confirme le placement de cet emballage dans cette charge.",
  add: "Scanner et ajouter l’emballage",
  simulate: "Simuler une lecture d’emballage",
  prepare: "Préparer un exemple fictif de lecture d’emballage en charge",
  help: "Une lecture confirmée enregistre un emballage dans ce brouillon. Version, rappels, retours et garde sont revérifiés. Le démarrage du cycle exige une confirmation séparée.",
  added: "Emballage ajouté par lecture",
  SCAN_DUPLICATE: "Cet emballage est déjà dans la charge.",
  INVALID_REQUEST:
    "Saisissez un identifiant Ruby RSP-P complet et confirmez le placement.",
  NOT_FOUND: "Emballage ou charge introuvable dans cet établissement.",
  CONFLICT:
    "La version de la charge ou de l’emballage a changé. Rechargez et utilisez l’étiquette actuelle.",
  LOAD_BLOCKED: "Emballage annulé, inactif ou affecté à une autre charge.",
  RECALL_BLOCKED:
    "Un emballage est bloqué par un rappel. Consultez le dossier.",
  RETURN_BLOCKED: "Un emballage retourné ne peut pas être chargé à nouveau.",
  error: "Ajout non confirmé. Vérifiez l’état actuel avant de réessayer.",
  dataMatrix: "Data Matrix de l’identifiant d’emballage Ruby",
  generating: "Génération du Data Matrix d’emballage…",
  renderError: "Symbole non généré. Rechargez avant impression.",
};
export const loadScanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
