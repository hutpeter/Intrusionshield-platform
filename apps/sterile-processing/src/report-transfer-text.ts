import type { Language } from "./text";
const en = {
  title: "Transfer report presets",
  filters: "Filters",
  noFilters: "No input filters",
  export: "Export presets JSON",
  file: "Choose presets JSON file",
  review: "Review import",
  note: "Transfer names and filters only. Imported presets belong to your current user and facility in this browser. Review exact lot codes and fixed dates for this facility. Duplicate names are skipped; existing presets are kept.",
  name: "Preset name",
  report: "Report",
  status: "Import status",
  ready: "Ready to import",
  duplicate: "Duplicate name — skipped",
  confirm: "Import new presets",
  cancel: "Cancel import",
  invalid:
    "Cannot read this preset file. Use a version 1 Ruby preset JSON file, up to 128 KB and 100 valid presets.",
  failed:
    "Presets could not be saved. Review the list again; browser storage may be blocked or presets may have changed.",
  exportFailed:
    "Could not export presets. Browser storage may be blocked or invalid.",
  done: "Presets imported.",
  capacity:
    "The new presets would exceed the limit of 100. Cancel and reduce the file or remove saved presets first.",
  empty: "No new presets to import.",
  count: "New presets",
  skipped: "Skipped duplicates",
};
const es: typeof en = {
  title: "Transferir configuraciones de informes",
  filters: "Filtros",
  noFilters: "Sin filtros de entrada",
  export: "Exportar configuraciones JSON",
  file: "Elegir archivo JSON de configuraciones",
  review: "Revisar importación",
  note: "Solo nombres y filtros. Las configuraciones importadas pertenecen al usuario y centro actuales en este navegador. Revise los códigos exactos de lote y las fechas fijas. Los nombres duplicados se omiten; se conservan las configuraciones existentes.",
  name: "Nombre de configuración",
  report: "Informe",
  status: "Estado de importación",
  ready: "Lista para importar",
  duplicate: "Nombre duplicado — omitido",
  confirm: "Importar configuraciones nuevas",
  cancel: "Cancelar importación",
  invalid:
    "No se puede leer el archivo. Use JSON de Ruby versión 1, hasta 128 KB y 100 configuraciones válidas.",
  failed:
    "No se pudo guardar. Revise la lista; el almacenamiento puede estar bloqueado o las configuraciones haber cambiado.",
  exportFailed:
    "No se pudo exportar. El almacenamiento puede estar bloqueado o ser inválido.",
  done: "Configuraciones importadas.",
  capacity:
    "Las nuevas configuraciones superarían el límite de 100. Cancele y reduzca el archivo o elimine configuraciones guardadas.",
  empty: "No hay configuraciones nuevas para importar.",
  count: "Configuraciones nuevas",
  skipped: "Duplicados omitidos",
};
const fr: typeof en = {
  title: "Transférer les préréglages de rapports",
  filters: "Filtres",
  noFilters: "Aucun filtre de saisie",
  export: "Exporter les préréglages JSON",
  file: "Choisir un fichier JSON de préréglages",
  review: "Vérifier l’import",
  note: "Noms et filtres uniquement. Les préréglages importés appartiennent à votre utilisateur et établissement actuels dans ce navigateur. Vérifiez les codes exacts de lot et dates fixes. Les noms en double sont ignorés ; les préréglages existants sont conservés.",
  name: "Nom du préréglage",
  report: "Rapport",
  status: "État de l’import",
  ready: "Prêt à importer",
  duplicate: "Nom en double — ignoré",
  confirm: "Importer les nouveaux préréglages",
  cancel: "Annuler l’import",
  invalid:
    "Fichier illisible. Utilisez un JSON Ruby version 1, au maximum 128 Ko et 100 préréglages valides.",
  failed:
    "Enregistrement impossible. Revérifiez la liste ; le stockage peut être bloqué ou les préréglages modifiés.",
  exportFailed: "Export impossible. Le stockage peut être bloqué ou invalide.",
  done: "Préréglages importés.",
  capacity:
    "Les nouveaux préréglages dépasseraient la limite de 100. Annulez et réduisez le fichier ou supprimez des préréglages enregistrés.",
  empty: "Aucun nouveau préréglage à importer.",
  count: "Nouveaux préréglages",
  skipped: "Doublons ignorés",
};
export const transferLabels = (l: Language) => ({ en, es, fr })[l];
