import {
    LanguageSelector,
    useI18n
} from "./index.js";

export function InternationalizationProof() {
    const {
        language,
        locale,
        messages
    } = useI18n();

    return (
        <div
            style={{
                position: "fixed",
                right: "24px",
                bottom: "24px",
                zIndex: 900,
                width: "310px",
                border: "1px solid #d0d5dd",
                borderRadius: "12px",
                background: "#ffffff",
                boxShadow:
                    "0 12px 30px rgba(15, 23, 42, 0.16)",
                padding: "16px"
            }}
        >
            <div
                style={{
                    marginBottom: "12px",
                    color: "#172033",
                    fontSize: "13px",
                    fontWeight: 700
                }}
            >
                EIS Internationalization
            </div>

            <LanguageSelector />

            <div
                style={{
                    marginTop: "14px",
                    paddingTop: "12px",
                    borderTop:
                        "1px solid #e6eaf0",
                    color: "#475467",
                    fontSize: "12px",
                    lineHeight: 1.6
                }}
            >
                <div>
                    <strong>
                        {messages.athena.people.title}
                    </strong>
                </div>

                <div>
                    {
                        messages.athena.people
                            .newPerson
                    }
                </div>

                <div>
                    {
                        messages.athena.people
                            .sections.demographics
                    }
                </div>

                <div>
                    {
                        messages.athena.people
                            .sections
                            .facilityAffiliations
                    }
                </div>

                <div
                    style={{
                        marginTop: "8px",
                        color: "#667085"
                    }}
                >
                    {language} / {locale}
                </div>
            </div>
        </div>
    );
}
