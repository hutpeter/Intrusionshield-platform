import {
  shelfLifeState,
  type ShelfLifePolicy,
  type PackageIntegrityHold,
} from "@intrusionshield/sterile-processing/package-safety";
import type { Language } from "./text";
import { packageSafetyLabels } from "./package-safety-text";
export function PackageSafety({
  policy,
  hold,
  language,
  date,
}: {
  policy?: ShelfLifePolicy;
  hold?: PackageIntegrityHold;
  language: Language;
  date: (at: string) => string;
}) {
  const t = packageSafetyLabels(language),
    state = shelfLifeState(policy);
  return (
    <section className="panel">
      <h2>{t.title}</h2>
      <p className={state === "expired" || hold ? "alert" : "info"}>
        {t[state]}
      </p>
      {policy ? (
        <>
          <p>
            {t.reference}: {policy.reference} · {t.revision} {policy.revision}
          </p>
          {policy.expiresAt && (
            <p>
              {t.expiry}: {policy.expiresAt} · {date(policy.expiresAt)}
            </p>
          )}
          <p>{t.policyHelp}</p>
        </>
      ) : (
        <p>{t.legacy}</p>
      )}
      {hold && (
        <>
          <p className="alert">{t.hold}</p>
          <p>
            {t.reason}: {hold.reason}
          </p>
          <p>
            {t.evidence}: {hold.evidence}
          </p>
          <p>
            {t.location}: {hold.location}
          </p>
          <p>
            {t.heldAt}: {date(hold.at)} · {hold.actorId}
          </p>
          <p>{t.holdHelp}</p>
        </>
      )}
    </section>
  );
}
