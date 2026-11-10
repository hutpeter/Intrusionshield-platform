import { createHash } from "node:crypto";
import {
  ConsumableRegistry,
  ConsumableStockRegistry,
  StockReconciliationRegistry,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
export async function prepareReviewQueueExample(
  repository: SterileRepository,
  operator: SterileScope,
  requestId: string,
) {
  const key = sterileUuid(requestId),
    id = (kind: string) => {
      const h = createHash("sha256")
        .update("review-queue:" + key + ":" + kind)
        .digest("hex");
      return (
        h.slice(0, 8) +
        "-" +
        h.slice(8, 12) +
        "-4" +
        h.slice(13, 16) +
        "-a" +
        h.slice(17, 20) +
        "-" +
        h.slice(20, 32)
      );
    },
    lots = new ConsumableRegistry(repository),
    stock = new ConsumableStockRegistry(repository),
    counts = new StockReconciliationRegistry(repository);
  const result = [];
  for (const kind of ["READY", "STALE"]) {
    const lot = await lots.register(operator, {
      requestId: id(kind + ":lot"),
      code: "REVIEW-" + kind + "-" + key,
      kind: "wrap",
      name: "SIMULATED reviewer queue wrap",
      lotNumber: "SIMULATED-" + kind + "-LOT",
      supplier: "DEMO-SUPPLIER",
      supplierReference: "SIMULATED-DELIVERY",
      expiresOn: "2099-01-01",
      confirmed: true,
    });
    await stock.record(operator, lot.id, "receive", {
      requestId: id(kind + ":receipt"),
      version: 0,
      quantity: 10,
      reason: "SIMULATED review queue prerequisites",
      reference: "SIMULATED-DELIVERY",
      confirmed: true,
    });
    const count = await counts.record(operator, lot.id, {
      requestId: id(kind + ":count"),
      stockVersion: 1,
      countedAvailable: 8,
      reason: "SIMULATED " + kind + " physical count",
      reference: "SIMULATED-COUNT-EVIDENCE",
      confirmed: true,
    });
    if (kind === "STALE")
      await stock.record(operator, lot.id, "receive", {
        requestId: id(kind + ":later"),
        version: 1,
        quantity: 2,
        reason: "SIMULATED movement after count",
        reference: "SIMULATED-LATER-DELIVERY",
        confirmed: true,
      });
    result.push(await counts.get(operator, lot.id, count.id));
  }
  return { ready: result[0]!, stale: result[1]! };
}
