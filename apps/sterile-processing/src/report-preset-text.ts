import type { Language } from "./text";
const en = {
  title: "Saved report presets",
  note: "Saved in this browser for your user and facility. Filters only; Run preset fetches a fresh snapshot. Movement presets support fixed or relative UTC dates. Clearing browser data removes presets.",
  name: "Preset name",
  save: "Save preset",
  run: "Run preset",
  remove: "Delete preset",
  empty: "No saved presets.",
  saved: "Preset saved.",
  error:
    "Could not save preset. Use a unique name (1–80 characters), valid filters and at most 100 presets.",
  storage:
    "Presets are unavailable in this browser. Stored data may be invalid or browser storage may be blocked. Existing data has been kept.",
  deleted: "Preset deleted.",
};
const es: typeof en = {
  title: "Configuraciones de informes guardadas",
  note: "Guardadas en este navegador para su usuario y centro. Solo filtros; Ejecutar obtiene una instantánea nueva. Los movimientos admiten fechas UTC fijas o relativas. Borrar los datos del navegador elimina las configuraciones.",
  name: "Nombre de configuración",
  save: "Guardar configuración",
  run: "Ejecutar configuración",
  remove: "Eliminar configuración",
  empty: "No hay configuraciones guardadas.",
  saved: "Configuración guardada.",
  error:
    "No se pudo guardar. Use un nombre único (1–80 caracteres), filtros válidos y un máximo de 100 configuraciones.",
  storage:
    "Configuraciones no disponibles. Los datos pueden ser inválidos o el almacenamiento estar bloqueado. Se conservaron los datos existentes.",
  deleted: "Configuración eliminada.",
};
const fr: typeof en = {
  title: "Préréglages de rapports enregistrés",
  note: "Enregistrés dans ce navigateur pour votre utilisateur et établissement. Filtres seuls ; Exécuter récupère un nouvel instantané. Les mouvements acceptent des dates UTC fixes ou relatives. Effacer les données du navigateur supprime les préréglages.",
  name: "Nom du préréglage",
  save: "Enregistrer le préréglage",
  run: "Exécuter le préréglage",
  remove: "Supprimer le préréglage",
  empty: "Aucun préréglage enregistré.",
  saved: "Préréglage enregistré.",
  error:
    "Enregistrement impossible. Utilisez un nom unique (1–80 caractères), des filtres valides et au maximum 100 préréglages.",
  storage:
    "Préréglages indisponibles. Les données peuvent être invalides ou le stockage bloqué. Les données existantes sont conservées.",
  deleted: "Préréglage supprimé.",
};
export const presetLabels = (l: Language) => ({ en, es, fr })[l];
