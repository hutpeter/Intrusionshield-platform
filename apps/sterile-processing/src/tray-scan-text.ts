import type { Language } from "./text";
const en = {
  title: "Scan into draft tray",
  identifier: "Instrument scan identifier",
  confirm: "I confirm this instrument is being placed in this tray.",
  add: "Scan and add instrument",
  simulate: "Simulate instrument scan",
  prepare: "Prepare fictional tray scan example",
  help: "A confirmed scan saves one instrument to this draft. Type, quantity, custody and holds are checked again on the server. It does not complete or release the tray.",
  added: "Instrument added by scan",
  SCAN_DUPLICATE: "This instrument is already assigned to the tray.",
  SCAN_TYPE:
    "Instrument type does not match or its required quantity is already filled.",
  SCAN_INELIGIBLE: "The instrument is retired or held for maintenance.",
  INVALID_REQUEST:
    "Enter a complete Ruby RSP-I identifier and confirm placement.",
  NOT_FOUND: "Instrument or tray not found in this facility.",
  CONFLICT: "The tray changed or is no longer a draft. Reload before retrying.",
  PROCESSING_HOLD:
    "The instrument is held in receiving, cleaning or inspection.",
  INSTRUMENT_ASSIGNED:
    "The instrument belongs to another active tray or is unavailable.",
  RECALL_BLOCKED: "An instrument is blocked by a recall. Review its case.",
  error:
    "The addition was not confirmed. Check the current tray and instrument before retrying.",
};
const es: typeof en = {
  title: "Escanear al armado en borrador",
  identifier: "Identificador de escaneo del instrumento",
  confirm: "Confirmo que este instrumento se coloca en esta bandeja.",
  add: "Escanear y añadir instrumento",
  simulate: "Simular escaneo de instrumento",
  prepare: "Preparar ejemplo ficticio de escaneo a bandeja",
  help: "Un escaneo confirmado guarda un instrumento en este borrador. El servidor verifica tipo, cantidad, custodia y retenciones. No completa ni libera la bandeja.",
  added: "Instrumento añadido por escaneo",
  SCAN_DUPLICATE: "Este instrumento ya está asignado a la bandeja.",
  SCAN_TYPE: "El tipo no corresponde o su cantidad requerida ya está cubierta.",
  SCAN_INELIGIBLE: "El instrumento está retirado o retenido por mantenimiento.",
  INVALID_REQUEST:
    "Ingrese un identificador Ruby RSP-I completo y confirme la colocación.",
  NOT_FOUND: "Instrumento o bandeja no encontrado en este centro.",
  CONFLICT:
    "El armado cambió o ya no es un borrador. Actualice antes de reintentar.",
  PROCESSING_HOLD:
    "El instrumento está retenido en recepción, limpieza o inspección.",
  INSTRUMENT_ASSIGNED:
    "El instrumento pertenece a otra bandeja activa o no está disponible.",
  RECALL_BLOCKED:
    "Un instrumento está bloqueado por una retirada. Revise el caso.",
  error:
    "La adición no fue confirmada. Revise el estado vigente antes de reintentar.",
};
const fr: typeof en = {
  title: "Scanner dans un plateau en brouillon",
  identifier: "Identifiant de lecture de l’instrument",
  confirm: "Je confirme le placement de cet instrument dans ce plateau.",
  add: "Scanner et ajouter l’instrument",
  simulate: "Simuler la lecture d’un instrument",
  prepare: "Préparer un exemple fictif de lecture dans un plateau",
  help: "Une lecture confirmée enregistre un instrument dans ce brouillon. Le serveur vérifie type, quantité, garde et blocages. Elle ne termine ni ne libère le plateau.",
  added: "Instrument ajouté par lecture",
  SCAN_DUPLICATE: "Cet instrument est déjà affecté au plateau.",
  SCAN_TYPE: "Type incompatible ou quantité requise déjà atteinte.",
  SCAN_INELIGIBLE: "Instrument retiré ou bloqué pour maintenance.",
  INVALID_REQUEST:
    "Saisissez un identifiant Ruby RSP-I complet et confirmez le placement.",
  NOT_FOUND: "Instrument ou plateau introuvable dans cet établissement.",
  CONFLICT:
    "Le plateau a changé ou n’est plus un brouillon. Rechargez avant de réessayer.",
  PROCESSING_HOLD: "Instrument retenu en réception, nettoyage ou inspection.",
  INSTRUMENT_ASSIGNED:
    "Instrument affecté à un autre plateau actif ou indisponible.",
  RECALL_BLOCKED:
    "Un instrument est bloqué par un rappel. Consultez le dossier.",
  error: "Ajout non confirmé. Vérifiez l’état actuel avant de réessayer.",
};
export const trayScanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
