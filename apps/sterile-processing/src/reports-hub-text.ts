import type { Language } from "./text";
const en = {
  title: "Reports hub",
  intro:
    "Choose a stock report, generate a snapshot, then export CSV or print.",
  open: "Open report",
  back: "Back to Reports hub",
  balances: "Recorded quantities and usable stock for each registered lot.",
  movements:
    "Receipts, usage, quarantine, disposal and approved adjustments by UTC period.",
  replenishment:
    "Low-stock lots, supplier details, targets and suggested replenishment quantities.",
  expiry:
    "Expired and approaching-expiry lots with available and quarantined stock.",
};
const es: typeof en = {
  title: "Centro de informes",
  intro:
    "Elija un informe de existencias, genere una instantánea y exporte CSV o imprima.",
  open: "Abrir informe",
  back: "Volver al centro de informes",
  balances: "Cantidades registradas y existencias utilizables por lote.",
  movements:
    "Recepciones, uso, cuarentena, desechos y ajustes aprobados por período UTC.",
  replenishment:
    "Lotes con existencias bajas, proveedores, objetivos y cantidades de reposición sugeridas.",
  expiry:
    "Lotes caducados o próximos a caducar, con existencias disponibles y en cuarentena.",
};
const fr: typeof en = {
  title: "Centre de rapports",
  intro:
    "Choisissez un rapport de stock, générez un instantané, puis exportez en CSV ou imprimez.",
  open: "Ouvrir le rapport",
  back: "Retour au centre de rapports",
  balances: "Quantités enregistrées et stock utilisable pour chaque lot.",
  movements:
    "Réceptions, utilisation, quarantaine, élimination et ajustements approuvés par période UTC.",
  replenishment:
    "Lots à stock faible, fournisseurs, cibles et quantités de réapprovisionnement suggérées.",
  expiry:
    "Lots périmés ou proches de la péremption, avec stock disponible et en quarantaine.",
};
export const reportsHubLabels = (l: Language) => ({ en, es, fr })[l];
