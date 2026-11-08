import type { Language } from "./text";
const en = {
  title: "Loaner and vendor sets",
  readmit: "Readmit returned loaner set",
  prepareReadmit: "Prepare fictional loaner readmission example",
  saveReadmit: "Save loaner readmission",
  episodeCode: "New receiving episode code",
  readmitChecked:
    "I confirm all original instruments are physically present for this new visit.",
  readmitConfirmed:
    "I confirm this readmission; all instruments require fresh processing and existing service limits remain.",
  readmitHelp:
    "Reuses the original instrument identities and supplier owner. No earlier inspection, release or service reset is inherited.",
  visit: "Visit",
  readmitted: "Loaner readmission recorded",

  receive: "Receive loaner set",
  example: "Prepare fictional loaner receipt example",
  save: "Save loaner receipt",
  code: "Loaner receipt code",
  supplier: "Supplier / owner",
  supplierReference: "Supplier set reference",
  dueOn: "Expected supplier return date (optional)",
  location: "Receiving location",
  custodian: "Handed over by",
  reference: "Receipt reference",
  condition: "Condition on receipt",
  note: "Observation (optional)",
  contents: "Expected instrument contents",
  instrumentCode: "New internal instrument code",
  type: "Instrument type",
  serial: "Serial number (optional)",
  add: "Add instrument",
  remove: "Remove",
  received: "Received — with facility",
  returned: "Returned to supplier — unavailable",
  checked:
    "I confirm all listed expected instruments were physically received; incomplete or unexpected contents require a separate exception.",
  confirmed:
    "I confirm this loaner receipt and supplier ownership; fresh processing is required.",
  saved: "Loaner record saved.",
  back: "Back to loaner sets",
  history: "Loaner receipt and hand-back history",
  episode: "Linked receiving episode",
  openProcessing: "Open receiving and cleaning",
  returnSet: "Record supplier hand-back",
  recipient: "Supplier recipient (manually recorded)",
  returnReference: "Hand-back reference",
  returnChecked:
    "I confirm the complete original set is accounted for and ready for supplier hand-back.",
  returnConfirmed:
    "I confirm this supplier hand-back; these instruments will be unavailable in this facility.",
  saveReturn: "Save supplier hand-back",
  owner: "External ownership",
  openReceipt: "Open loaner receipt",
  unavailable: "Loaner status unavailable",
  boundary:
    "Manually recorded fictional demonstration. Loaner receipt creates new instrument identities and fresh cleaning holds; it does not establish sterility or release. Only complete declared sets can be received here. Supplier hand-back requires passed inspection and no active tray, processing, repair or recall holds. Recipient references are not signatures or supplier acknowledgements. Do not enter patient data.",
  newOnly:
    "Use new instrument codes. Existing facility-owned instruments cannot be relabelled as loaners. Use Readmit returned loaner set for a later visit.",
  empty: "No loaner receipts yet.",
  historical: "Historical version",
  current: "Back to current version",
};
const es: typeof en = {
  title: "Conjuntos prestados y de proveedores",
  readmit: "Readmitir conjunto devuelto",
  prepareReadmit: "Preparar ejemplo ficticio de readmisión prestada",
  saveReadmit: "Guardar readmisión prestada",
  episodeCode: "Código del nuevo episodio de recepción",
  readmitChecked:
    "Confirmo la presencia física de todos los instrumentos originales para esta nueva visita.",
  readmitConfirmed:
    "Confirmo la readmisión; se requiere nuevo procesamiento y se mantienen los límites de servicio.",
  readmitHelp:
    "Reutiliza identidades originales y propietario. No hereda inspección, liberación ni reinicio de servicio.",
  visit: "Visita",
  readmitted: "Readmisión prestada registrada",

  receive: "Recibir conjunto prestado",
  example: "Preparar ejemplo ficticio de recepción prestada",
  save: "Guardar recepción prestada",
  code: "Código de recepción prestada",
  supplier: "Proveedor / propietario",
  supplierReference: "Referencia del conjunto del proveedor",
  dueOn: "Fecha prevista de devolución (opcional)",
  location: "Ubicación de recepción",
  custodian: "Entregado por",
  reference: "Referencia de recepción",
  condition: "Condición de recepción",
  note: "Observación (opcional)",
  contents: "Instrumentos esperados",
  instrumentCode: "Nuevo código interno de instrumento",
  type: "Tipo de instrumental",
  serial: "Número de serie (opcional)",
  add: "Añadir instrumento",
  remove: "Quitar",
  received: "Recibido — en este centro",
  returned: "Devuelto al proveedor — no disponible",
  checked:
    "Confirmo la recepción física de todos los instrumentos esperados; faltantes o inesperados requieren una excepción separada.",
  confirmed:
    "Confirmo recepción y propiedad del proveedor; se requiere nuevo procesamiento.",
  saved: "Registro de préstamo guardado.",
  back: "Volver a préstamos",
  history: "Historial de recepción y devolución al proveedor",
  episode: "Episodio de recepción vinculado",
  openProcessing: "Abrir recepción y limpieza",
  returnSet: "Registrar devolución al proveedor",
  recipient: "Receptor del proveedor (registro manual)",
  returnReference: "Referencia de devolución",
  returnChecked:
    "Confirmo que el conjunto original completo está contabilizado y listo para devolución.",
  returnConfirmed:
    "Confirmo esta devolución al proveedor; los instrumentos no estarán disponibles en este centro.",
  saveReturn: "Guardar devolución al proveedor",
  owner: "Propiedad externa",
  openReceipt: "Abrir recepción prestada",
  unavailable: "Estado del préstamo no disponible",
  boundary:
    "Demostración ficticia con registro manual. La recepción crea identidades nuevas y retenciones para limpieza; no acredita esterilidad ni liberación. Solo se reciben conjuntos declarados completos. La devolución requiere inspección satisfactoria y ausencia de bandejas activas o retenciones de procesamiento, reparación o retirada. Las referencias del receptor no son firmas ni acuses del proveedor. No ingrese datos de pacientes.",
  newOnly:
    "Use códigos nuevos. No se cambia la propiedad de instrumentos existentes. Use la readmisión para una visita posterior.",
  empty: "Sin recepciones prestadas.",
  historical: "Versión histórica",
  current: "Volver a versión vigente",
};
const fr: typeof en = {
  title: "Ensembles prêtés et fournisseurs",
  readmit: "Réadmettre un ensemble rendu",
  prepareReadmit: "Préparer un exemple fictif de réadmission prêtée",
  saveReadmit: "Enregistrer la réadmission prêtée",
  episodeCode: "Code du nouvel épisode de réception",
  readmitChecked:
    "Je confirme la présence physique de tous les instruments d’origine pour cette nouvelle visite.",
  readmitConfirmed:
    "Je confirme la réadmission ; un nouveau traitement est requis et les seuils d’entretien restent applicables.",
  readmitHelp:
    "Réutilise les identités et propriétaire d’origine. Aucun contrôle, libération ou compteur d’entretien antérieur n’est rétabli.",
  visit: "Visite",
  readmitted: "Réadmission prêtée enregistrée",

  receive: "Recevoir un ensemble prêté",
  example: "Préparer un exemple fictif de réception prêtée",
  save: "Enregistrer la réception prêtée",
  code: "Code de réception prêtée",
  supplier: "Fournisseur / propriétaire",
  supplierReference: "Référence de l’ensemble fournisseur",
  dueOn: "Date prévue de retour fournisseur (facultative)",
  location: "Lieu de réception",
  custodian: "Remis par",
  reference: "Référence de réception",
  condition: "État à la réception",
  note: "Observation (facultative)",
  contents: "Instruments attendus",
  instrumentCode: "Nouveau code interne d’instrument",
  type: "Type d’instrument",
  serial: "Numéro de série (facultatif)",
  add: "Ajouter un instrument",
  remove: "Retirer",
  received: "Reçu — dans cet établissement",
  returned: "Rendu au fournisseur — indisponible",
  checked:
    "Je confirme la réception physique de tous les instruments attendus ; les manquants ou inattendus nécessitent une exception séparée.",
  confirmed:
    "Je confirme la réception et la propriété du fournisseur ; un nouveau traitement est requis.",
  saved: "Enregistrement du prêt sauvegardé.",
  back: "Retour aux ensembles prêtés",
  history: "Historique de réception et de remise fournisseur",
  episode: "Épisode de réception lié",
  openProcessing: "Ouvrir réception et nettoyage",
  returnSet: "Enregistrer la remise au fournisseur",
  recipient: "Destinataire fournisseur (saisie manuelle)",
  returnReference: "Référence de remise",
  returnChecked:
    "Je confirme que l’ensemble original complet est comptabilisé et prêt à être rendu.",
  returnConfirmed:
    "Je confirme cette remise au fournisseur ; ces instruments seront indisponibles ici.",
  saveReturn: "Enregistrer la remise fournisseur",
  owner: "Propriété externe",
  openReceipt: "Ouvrir la réception prêtée",
  unavailable: "Statut du prêt indisponible",
  boundary:
    "Démonstration fictive avec saisie manuelle. La réception crée de nouvelles identités et retenues pour nettoyage ; elle ne prouve ni stérilité ni libération. Seuls les ensembles déclarés complets sont reçus. La remise exige une inspection satisfaisante sans plateau actif ni blocage de traitement, réparation ou rappel. Les références du destinataire ne sont ni signatures ni accusés fournisseur. Aucune donnée patient.",
  newOnly:
    "Utilisez de nouveaux codes. Aucun changement de propriétaire d’instruments existants. Utilisez la réadmission pour une visite ultérieure.",
  empty: "Aucune réception prêtée.",
  historical: "Version historique",
  current: "Retour à la version courante",
};
export const loanerLabels = (l: Language) => ({ en, es, fr })[l];
