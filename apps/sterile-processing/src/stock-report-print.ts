import type { Language } from "./text";
import type {
  StockPrintModel,
  StockPrintField,
  StockPrintValue,
} from "./stock-report-print-model";
import { stockPrintLabels } from "./stock-report-print-text.ts";
let activeCleanup: (() => void) | null = null;
/** Build an isolated print tree from the saved report, never the paged/live UI. */
export function printStockReport(model: StockPrintModel, language: Language) {
  activeCleanup?.();
  const p = stockPrintLabels(language),
    root = document.createElement("article"),
    oldTitle = document.title,
    printTitle = model.title + " — " + model.generatedAt.slice(0, 10);
  root.id = "stock-report-print-root";
  root.className = "stock-report-print-root";
  root.lang = language;
  const text = (value: StockPrintValue) =>
    value == null
      ? "—"
      : typeof value === "boolean"
        ? value
          ? p.yes
          : p.no
        : String(value);
  function node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    value?: StockPrintValue,
  ) {
    const e = document.createElement(tag);
    if (value !== undefined) e.textContent = text(value);
    return e;
  }
  root.append(node("h1", "ruby · " + model.title), node("p", model.note));
  const metadata = node("dl");
  metadata.className = "stock-print-metadata";
  for (const [label, value] of model.metadata) {
    const pair = node("div");
    pair.append(node("dt", label), node("dd", value));
    metadata.append(pair);
  }
  root.append(metadata);
  if (!model.records.length) root.append(node("p", model.empty));
  for (const [recordIndex, record] of model.records.entries()) {
    const section = node("section");
    section.className = "stock-print-record";
    section.append(node("h2", `${recordIndex + 1}. ${record.title}`));
    const table = node("table");
    table.className = "stock-print-fields";
    const group = node("colgroup");
    for (const c of ["label", "value", "label", "value"]) {
      const col = node("col");
      col.className = "stock-print-" + c;
      group.append(col);
    }
    table.append(group);
    const body = node("tbody");
    for (let i = 0; i < record.fields.length; i += 2) {
      const tr = node("tr");
      for (const field of [record.fields[i], record.fields[i + 1]] as (
        StockPrintField | undefined
      )[]) {
        const th = node("th", field?.[0] ?? "");
        th.scope = "row";
        tr.append(th, node("td", field ? text(field[1]) : ""));
      }
      body.append(tr);
    }
    table.append(body);
    section.append(table);
    root.append(section);
  }
  const media = window.matchMedia("print"),
    onMedia = (event: MediaQueryListEvent) => {
      if (!event.matches) cleanup();
    };
  function cleanup() {
    root.remove();
    if (document.title === printTitle) document.title = oldTitle;
    window.removeEventListener("afterprint", cleanup);
    media.removeEventListener("change", onMedia);
    if (activeCleanup === cleanup) activeCleanup = null;
  }
  activeCleanup = cleanup;
  window.addEventListener("afterprint", cleanup, { once: true });
  media.addEventListener("change", onMedia);
  document.title = printTitle;
  document.body.append(root);
  try {
    window.print();
  } catch (e) {
    cleanup();
    throw e;
  }
}
