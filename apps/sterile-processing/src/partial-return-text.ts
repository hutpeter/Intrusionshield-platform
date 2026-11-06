import type { Language } from "./text";
const en = {
  mode: "Some expected instruments are missing.",
  help: "Select only the expected instruments physically received. Unselected instruments are recorded as missing. Do not add unexpected instruments here; record their references in the observation and follow the separate exception procedure.",
  received: "Received instruments",
  missing: "Missing instruments",
  reason: "Discrepancy reason",
  save: "Save discrepancy",
  confirm:
    "I confirm this received/missing list accurately records what arrived.",
  blocked:
    "Return discrepancy — package and all contents remain blocked. Disposition is unavailable until all expected instruments are received.",
  title: "Received and missing instrument reconciliation",
  origin: "Original issued contents and identifier",
  recover: "Record missing instruments received",
  saveRecovery: "Save later receipt",
  confirmRecovery:
    "I confirm these missing instruments have now been physically received; the package remains unavailable.",
  recoveryHistory: "Later receipt history",
  none: "None",
  complete:
    "All expected instruments accounted for — awaiting disposition; package remains unavailable.",
};
const es: typeof en = {
  mode: "Faltan instrumentos esperados.",
  help: "Seleccione solo los instrumentos esperados recibidos físicamente. Los no seleccionados quedan como faltantes. No añada instrumentos inesperados aquí; registre sus referencias en la observación y siga el procedimiento de excepción separado.",
  received: "Instrumentos recibidos",
  missing: "Instrumentos faltantes",
  reason: "Motivo de discrepancia",
  save: "Guardar discrepancia",
  confirm:
    "Confirmo que esta lista de recibidos y faltantes describe lo que llegó.",
  blocked:
    "Discrepancia de devolución — paquete y contenido bloqueados. No se permite disposición hasta recibir todos los instrumentos esperados.",
  title: "Conciliación de instrumentos recibidos y faltantes",
  origin: "Contenido e identificador originales de entrega",
  recover: "Registrar recepción de instrumentos faltantes",
  saveRecovery: "Guardar recepción posterior",
  confirmRecovery:
    "Confirmo la recepción física de estos instrumentos faltantes; el paquete sigue no disponible.",
  recoveryHistory: "Historial de recepciones posteriores",
  none: "Ninguno",
  complete:
    "Todos los instrumentos esperados contabilizados — pendiente de disposición; el paquete sigue no disponible.",
};
const fr: typeof en = {
  mode: "Des instruments attendus sont manquants.",
  help: "Sélectionnez uniquement les instruments attendus physiquement reçus. Les autres seront enregistrés comme manquants. N’ajoutez pas d’instruments inattendus ici ; notez leurs références dans l’observation et suivez la procédure d’exception séparée.",
  received: "Instruments reçus",
  missing: "Instruments manquants",
  reason: "Motif de l’écart",
  save: "Enregistrer l’écart",
  confirm:
    "Je confirme que cette liste des instruments reçus et manquants décrit ce qui est arrivé.",
  blocked:
    "Écart de retour — emballage et contenu bloqués. Aucune décision avant réception de tous les instruments attendus.",
  title: "Rapprochement des instruments reçus et manquants",
  origin: "Contenu délivré et identifiant d’origine",
  recover: "Enregistrer la réception des instruments manquants",
  saveRecovery: "Enregistrer la réception ultérieure",
  confirmRecovery:
    "Je confirme la réception physique de ces instruments manquants ; l’emballage reste indisponible.",
  recoveryHistory: "Historique des réceptions ultérieures",
  none: "Aucun",
  complete:
    "Tous les instruments attendus sont comptabilisés — décision en attente ; l’emballage reste indisponible.",
};
export const partialReturnLabels = (language: Language) =>
  ({ en, es, fr })[language];
