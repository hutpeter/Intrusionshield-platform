import {
  ReturnRegistry,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { prepareReturnExample } from "./return-example.js";
export async function prepareReturnScanExample(
  repository: SterileRepository,
  operator: SterileScope,
  reviewer: SterileScope,
  requestId: string,
) {
  const issue = await prepareReturnExample(
    repository,
    operator,
    reviewer,
    requestId,
  );
  return new ReturnRegistry(repository).scan(
    operator,
    `RSP-P-${issue.packageId.toUpperCase()}-V${issue.packageVersion}`,
  );
}
