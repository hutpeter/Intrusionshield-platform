export const accessText = {
  en: {
    title: "User access",
    help: "Manage existing users in this facility. Ruby accounts and verified person mappings are maintained separately.",
    user: "User",
    choose: "Choose a user",
    enabled: "Access enabled in this facility",
    reason: "Reason for change",
    confirm: "I confirm these facility permissions and access settings.",
    save: "Save access change",
    cancel: "Cancel",
    reload: "Reload access",
    history: "Access history",
    saved: "Access change saved. New permissions apply to subsequent requests.",
    error:
      "Access could not be saved or loaded. Reload before retrying an uncertain change.",
    self: "Your own account and aliases cannot be changed here. Use another authorized administrator.",
    inactive:
      "The Ruby account, local access or person mapping is unavailable. Resolve it through authorized account administration.",
    grantAdmin:
      "Managing user access allows granting permissions to other users in this facility. It does not itself authorize processing or release.",
    noUsers: "No enrolled users in this facility.",
    version: "Version",
    add: "Permissions added",
    remove: "Permissions removed",
    none: "None",
  },
  es: {
    title: "Acceso de usuarios",
    help: "Administre usuarios ya inscritos en este centro. Las cuentas Ruby y las identidades personales verificadas se mantienen por separado.",
    user: "Usuario",
    choose: "Seleccione un usuario",
    enabled: "Acceso habilitado en este centro",
    reason: "Motivo del cambio",
    confirm: "Confirmo estos permisos y ajustes de acceso del centro.",
    save: "Guardar cambio de acceso",
    cancel: "Cancelar",
    reload: "Recargar accesos",
    history: "Historial de acceso",
    saved:
      "Cambio guardado. Los permisos se aplican a las solicitudes posteriores.",
    error:
      "No se pudo guardar o cargar el acceso. Recargue antes de repetir un cambio incierto.",
    self: "No puede modificar su cuenta ni sus alias aquí. Otro administrador autorizado debe hacerlo.",
    inactive:
      "La cuenta Ruby, el acceso local o la identidad personal no está disponible. Resuélvalo mediante la administración autorizada de cuentas.",
    grantAdmin:
      "Administrar accesos permite conceder permisos a otros usuarios del centro. No autoriza por sí solo el procesamiento ni la liberación.",
    noUsers: "No hay usuarios inscritos en este centro.",
    version: "Versión",
    add: "Permisos añadidos",
    remove: "Permisos retirados",
    none: "Ninguno",
  },
  fr: {
    title: "Accès des utilisateurs",
    help: "Gérez les utilisateurs déjà inscrits dans cet établissement. Les comptes Ruby et les identités personnelles vérifiées sont gérés séparément.",
    user: "Utilisateur",
    choose: "Choisir un utilisateur",
    enabled: "Accès activé dans cet établissement",
    reason: "Motif du changement",
    confirm:
      "Je confirme ces permissions et paramètres d’accès pour l’établissement.",
    save: "Enregistrer le changement",
    cancel: "Annuler",
    reload: "Recharger les accès",
    history: "Historique des accès",
    saved:
      "Changement enregistré. Les permissions s’appliquent aux demandes suivantes.",
    error:
      "Impossible d’enregistrer ou de charger les accès. Rechargez avant de répéter un changement incertain.",
    self: "Votre compte et ses alias ne peuvent pas être modifiés ici. Un autre administrateur autorisé doit le faire.",
    inactive:
      "Le compte Ruby, l’accès local ou l’identité personnelle est indisponible. Consultez l’administrateur autorisé des comptes.",
    grantAdmin:
      "La gestion des accès permet d’attribuer des permissions aux autres utilisateurs de l’établissement. Elle n’autorise pas elle-même le traitement ou la libération.",
    noUsers: "Aucun utilisateur inscrit dans cet établissement.",
    version: "Version",
    add: "Permissions ajoutées",
    remove: "Permissions retirées",
    none: "Aucune",
  },
};
const areas: Record<string, [string, string, string]> = {
  access: ["User access", "Accesos de usuarios", "Accès des utilisateurs"],
  consumables: ["Consumables", "Consumibles", "Consommables"],
  reports: ["Reports", "Informes", "Rapports"],
  "equipment-incidents": [
    "Equipment incidents",
    "Incidentes de equipos",
    "Incidents d’équipement",
  ],
  equipment: [
    "Processing equipment",
    "Equipos de procesamiento",
    "Équipements de traitement",
  ],
  procedures: ["Procedures", "Procedimientos", "Procédures"],
  loaners: ["Loaner sets", "Sets en préstamo", "Ensembles prêtés"],
  dashboard: ["Dashboard", "Panel operativo", "Tableau de bord"],
  traceability: ["Traceability", "Trazabilidad", "Traçabilité"],
  maintenance: ["Maintenance", "Mantenimiento", "Entretien"],
  instruments: ["Instruments", "Instrumental", "Instruments"],
  trays: ["Trays", "Bandejas", "Plateaux"],
  processing: [
    "Receiving and cleaning",
    "Recepción y limpieza",
    "Réception et nettoyage",
  ],
  packaging: ["Packaging", "Empaque", "Emballage"],
  cycles: ["Loads and cycles", "Cargas y ciclos", "Charges et cycles"],
  release: ["Release review", "Revisión de liberación", "Revue de libération"],
  distribution: [
    "Storage and issue",
    "Almacenamiento y entrega",
    "Stockage et distribution",
  ],
  returns: ["Returns", "Devoluciones", "Retours"],
  recall: [
    "Withdrawal and recall",
    "Retirada y recuperación",
    "Retrait et rappel",
  ],
};
const actions: Record<string, [string, string, string]> = {
  read: ["View", "Consultar", "Consulter"],
  write: [
    "Record or update",
    "Registrar o actualizar",
    "Consigner ou modifier",
  ],
  manage: [
    "Manage permissions",
    "Administrar permisos",
    "Gérer les permissions",
  ],
  inspect: [
    "Inspect independently",
    "Inspeccionar de forma independiente",
    "Inspecter indépendamment",
  ],
  correct: ["Correct receipt", "Corregir recepción", "Corriger la réception"],
  cancel: ["Cancel receipt", "Cancelar recepción", "Annuler la réception"],
  reconcile: [
    "Reconcile counts",
    "Conciliar recuentos",
    "Rapprocher les quantités",
  ],
  policy: [
    "Set stock policy",
    "Definir política de stock",
    "Définir la politique de stock",
  ],
  withdraw: ["Withdraw lot", "Retirar lote", "Retirer un lot"],
  hold: ["Place hold", "Retener", "Mettre en attente"],
  publish: ["Publish revision", "Publicar revisión", "Publier une révision"],
  authorize: ["Authorize", "Autorizar", "Autoriser"],
  dispose: [
    "Authorize disposition",
    "Autorizar disposición",
    "Autoriser la disposition",
  ],
  clear: [
    "Authorize clearance",
    "Autorizar levantamiento",
    "Autoriser la levée",
  ],
  admit: [
    "Receive after clearance",
    "Recibir tras autorización",
    "Recevoir après autorisation",
  ],
  recover: [
    "Record recovery",
    "Registrar recuperación",
    "Consigner la récupération",
  ],
};
export function permissionLabel(
  permission: string,
  language: "en" | "es" | "fr",
) {
  const [area, action] = permission.split(":");
  const index = language === "en" ? 0 : language === "es" ? 1 : 2;
  return `${areas[area ?? ""]?.[index] ?? area} — ${actions[action ?? ""]?.[index] ?? action}`;
}

/** Sort display copies by translated names; never reorder saved grant arrays. */
export function sortedPermissions(
  permissions: readonly string[],
  language: "en" | "es" | "fr",
) {
  const collator = new Intl.Collator(language, { sensitivity: "base" });
  return [...permissions].sort(
    (a, b) =>
      collator.compare(
        permissionLabel(a, language),
        permissionLabel(b, language),
      ) || a.localeCompare(b),
  );
}
