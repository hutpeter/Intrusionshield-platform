import type { Language } from "./text";
const en = {
  blocked:
    "Package expiry or integrity hold — review the package record before proceeding.",
  title: "Package integrity and shelf life",
  mode: "Shelf-life policy",
  choose: "Choose the facility policy",
  event_related: "Event-related — inspect integrity before use",
  time_based: "Time-based — explicit expiry",
  reference: "Facility policy reference",
  revision: "Policy revision",
  expiry: "Expiry date and time (UTC)",
  warning: "Expiry warning days",
  policyHelp:
    "Enter the approved facility policy and its expiry, if applicable. This is a recorded reference, not policy approval or a sterility claim. Saved policy and expiry cannot be extended on the existing package.",
  not_recorded: "Shelf-life policy not recorded — legacy package",
  within_date: "Within recorded expiry — check current release and integrity",
  approaching: "Approaching recorded expiry",
  expired: "Expired — new loading, release and distribution blocked",
  hold: "Integrity compromised — package blocked",
  report: "Report compromised integrity",
  reason: "Damage / integrity reason",
  evidence: "Integrity evidence reference",
  location: "Recorded location / quarantine reference",
  confirm: "I confirm compromised integrity and the persistent package hold.",
  save: "Save integrity hold",
  holdHelp:
    "This hold cannot be cleared here. Preserve the old package and label history. Use the applicable recall, return or authorized reprocessing workflow; a new package needs fresh checks. This does not notify anyone or physically quarantine stock.",
  heldAt: "Integrity hold recorded",
  legacy:
    "No expiry has been inferred. Apply the facility’s approved policy before use.",
  action: "Integrity hold recorded",
};
const es: typeof en = {
  blocked:
    "Caducidad o bloqueo de integridad — revise el paquete antes de continuar.",
  title: "Integridad y vida útil del paquete",
  mode: "Política de vida útil",
  choose: "Seleccione la política del centro",
  event_related:
    "Relacionada con eventos — inspeccione la integridad antes del uso",
  time_based: "Basada en tiempo — caducidad explícita",
  reference: "Referencia de la política del centro",
  revision: "Revisión de la política",
  expiry: "Fecha y hora de caducidad (UTC)",
  warning: "Días de aviso de caducidad",
  policyHelp:
    "Ingrese la política aprobada del centro y la caducidad aplicable. Es una referencia registrada, no aprobación de la política ni garantía de esterilidad. No se puede ampliar la caducidad del paquete existente.",
  not_recorded: "Política de vida útil no registrada — paquete anterior",
  within_date:
    "Dentro de la caducidad registrada — revise liberación e integridad",
  approaching: "Caducidad registrada próxima",
  expired: "Caducado — bloqueadas nuevas cargas, liberación y distribución",
  hold: "Integridad comprometida — paquete bloqueado",
  report: "Registrar integridad comprometida",
  reason: "Motivo del daño / integridad",
  evidence: "Referencia de evidencia de integridad",
  location: "Ubicación / referencia de cuarentena registrada",
  confirm:
    "Confirmo la integridad comprometida y el bloqueo persistente del paquete.",
  save: "Guardar bloqueo de integridad",
  holdHelp:
    "Este bloqueo no se elimina aquí. Conserve el historial del paquete y etiquetas. Use el flujo aplicable de retirada, devolución o reprocesamiento autorizado; un paquete nuevo requiere nuevas verificaciones. No se envían avisos ni se pone material en cuarentena física.",
  heldAt: "Bloqueo de integridad registrado",
  legacy:
    "No se ha inferido una caducidad. Aplique la política aprobada del centro antes del uso.",
  action: "Bloqueo de integridad registrado",
};
const fr: typeof en = {
  blocked:
    "Péremption ou blocage d’intégrité — consultez le paquet avant de continuer.",
  title: "Intégrité et durée de conservation",
  mode: "Politique de conservation",
  choose: "Choisissez la politique de l’établissement",
  event_related: "Liée aux événements — vérifier l’intégrité avant utilisation",
  time_based: "Fondée sur le temps — péremption explicite",
  reference: "Référence de politique de l’établissement",
  revision: "Révision de politique",
  expiry: "Date et heure de péremption (UTC)",
  warning: "Jours de préavis de péremption",
  policyHelp:
    "Saisissez la politique approuvée et la péremption applicable. Cette référence ne constitue ni approbation de politique ni garantie de stérilité. La péremption du paquet existant ne peut pas être prolongée.",
  not_recorded: "Politique de conservation non enregistrée — ancien paquet",
  within_date: "Dans la durée enregistrée — vérifier libération et intégrité",
  approaching: "Péremption enregistrée proche",
  expired: "Périmé — nouveaux chargement, libération et distribution bloqués",
  hold: "Intégrité compromise — paquet bloqué",
  report: "Signaler une intégrité compromise",
  reason: "Motif du dommage / intégrité",
  evidence: "Référence des preuves d’intégrité",
  location: "Emplacement / référence de quarantaine enregistré",
  confirm:
    "Je confirme l’intégrité compromise et le blocage persistant du paquet.",
  save: "Enregistrer le blocage d’intégrité",
  holdHelp:
    "Ce blocage ne peut pas être levé ici. Conservez l’historique du paquet et des étiquettes. Utilisez le rappel, retour ou retraitement autorisé applicable ; un nouveau paquet exige de nouveaux contrôles. Aucune notification ni quarantaine physique n’est effectuée.",
  heldAt: "Blocage d’intégrité enregistré",
  legacy:
    "Aucune péremption n’a été déduite. Appliquez la politique approuvée avant utilisation.",
  action: "Blocage d’intégrité enregistré",
};
export const packageSafetyLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
