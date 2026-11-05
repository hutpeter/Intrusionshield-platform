import type { Language } from "./text";
const en = {
  title: "Instrument identification",
  scan: "Scan or enter internal identifier",
  open: "Find instrument",
  help: "Focus this field, scan with a 2D keyboard scanner and press Enter. Only Ruby internal RSP-I identifiers are accepted. Lookup does not record receipt, inspection or release.",
  identifier: "Ruby internal scan identifier",
  print: "Print identification label",
  label: "Internal identification — not sterility or availability",
  warning:
    "Read current status in Ruby before use. This is not a manufacturer UDI or a marking instruction.",
  demo: "Prepare fictional scan example",
  simulate: "Simulate this scan",
  notFound: "No matching instrument in this facility.",
  invalid:
    "Enter a complete Ruby RSP-I identifier. URLs and manufacturer codes are not supported here.",
  error: "Lookup failed. Try again; do not infer availability.",
  renderError: "Label could not be generated. Reload before printing.",
  printing:
    "Printing opens the browser dialog; it does not confirm physical printing or label suitability.",
  code: "Instrument code",
  serial: "Manufacturer serial number",
  loading: "Generating Data Matrix…",
  example: "Fictional scan example",
  matched: "Instrument found — current record loaded",
  dataMatrix: "Data Matrix for Ruby internal identifier",
};
const es: typeof en = {
  title: "Identificación de instrumentos",
  scan: "Escanee o ingrese el identificador interno",
  open: "Buscar instrumento",
  help: "Seleccione este campo, escanee con un lector 2D de teclado y pulse Intro. Solo acepta identificadores internos RSP-I de Ruby. La búsqueda no registra recepción, inspección ni liberación.",
  identifier: "Identificador interno de escaneo Ruby",
  print: "Imprimir etiqueta de identificación",
  label: "Identificación interna — no acredita esterilidad ni disponibilidad",
  warning:
    "Consulte el estado vigente en Ruby antes del uso. No es un UDI del fabricante ni una instrucción de marcado.",
  demo: "Preparar ejemplo ficticio de escaneo",
  simulate: "Simular este escaneo",
  notFound: "No hay un instrumento coincidente en este centro.",
  invalid:
    "Ingrese un identificador Ruby RSP-I completo. No se aceptan URL ni códigos del fabricante aquí.",
  error: "Error de búsqueda. Intente nuevamente; no suponga disponibilidad.",
  renderError: "No se pudo generar la etiqueta. Actualice antes de imprimir.",
  printing:
    "La impresión abre el diálogo del navegador; no confirma impresión física ni idoneidad de la etiqueta.",
  code: "Código del instrumento",
  serial: "Número de serie del fabricante",
  loading: "Generando Data Matrix…",
  example: "Ejemplo ficticio de escaneo",
  matched: "Instrumento encontrado — registro vigente cargado",
  dataMatrix: "Data Matrix del identificador interno Ruby",
};
const fr: typeof en = {
  title: "Identification des instruments",
  scan: "Scanner ou saisir l’identifiant interne",
  open: "Rechercher l’instrument",
  help: "Sélectionnez ce champ, scannez avec un lecteur 2D de type clavier et appuyez sur Entrée. Seuls les identifiants internes Ruby RSP-I sont acceptés. La recherche ne confirme ni réception, ni inspection, ni libération.",
  identifier: "Identifiant interne de lecture Ruby",
  print: "Imprimer l’étiquette d’identification",
  label: "Identification interne — aucune preuve de stérilité ou disponibilité",
  warning:
    "Consultez l’état actuel dans Ruby avant utilisation. Ce n’est ni un UDI fabricant ni une instruction de marquage.",
  demo: "Préparer un exemple fictif de lecture",
  simulate: "Simuler cette lecture",
  notFound: "Aucun instrument correspondant dans cet établissement.",
  invalid:
    "Saisissez un identifiant Ruby RSP-I complet. Les URL et codes fabricant ne sont pas acceptés ici.",
  error: "Échec de recherche. Réessayez sans présumer de la disponibilité.",
  renderError: "Étiquette non générée. Rechargez avant impression.",
  printing:
    "L’impression ouvre la boîte de dialogue du navigateur ; elle ne confirme ni impression physique ni adéquation de l’étiquette.",
  code: "Code de l’instrument",
  serial: "Numéro de série fabricant",
  loading: "Génération Data Matrix…",
  example: "Exemple fictif de lecture",
  matched: "Instrument trouvé — fiche actuelle chargée",
  dataMatrix: "Data Matrix de l’identifiant interne Ruby",
};
export const scanLabels = (l: Language) =>
  l === "es" ? es : l === "fr" ? fr : en;
