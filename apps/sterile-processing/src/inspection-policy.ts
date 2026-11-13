import type { ProcessingEpisode } from "@intrusionshield/sterile-processing";
import type { Session } from "./api";
/** UX guidance only; the domain transaction always enforces the rule. */
export function inspectionBlock(
  episode: ProcessingEpisode,
  session: Session,
): "SELF_INSPECTION" | "INSPECTION_IDENTITY_REQUIRED" | null {
  const person = session.personId ?? session.actorId;
  for (const attempt of episode.attempts) {
    if (
      attempt.startedBy === session.actorId ||
      attempt.finishedBy === session.actorId ||
      attempt.startedByPersonId === person ||
      attempt.finishedByPersonId === person
    )
      return "SELF_INSPECTION";
    if (!attempt.startedByPersonId || !attempt.finishedByPersonId)
      return "INSPECTION_IDENTITY_REQUIRED";
  }
  return null;
}
export const independentInspectionText = {
  en: "Inspection requires an authorized person who did not start or finish cleaning in this episode.",
  es: "La inspección requiere una persona autorizada que no haya iniciado ni finalizado la limpieza de este episodio.",
  fr: "L’inspection nécessite une personne autorisée qui n’a ni commencé ni terminé le nettoyage de cet épisode.",
};
