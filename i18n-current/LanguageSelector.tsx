import {
    useI18n,
    type SupportedLanguage
} from "./index.js";

export function LanguageSelector() {
    const {
        language,
        messages,
        setLanguage
    } = useI18n();

    const handleChange = (
        value: string
    ) => {
        setLanguage(
            value as SupportedLanguage
        );
    };

    return (
        <label
            style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#475467",
                fontSize: "13px",
                fontWeight: 600
            }}
        >
            <span>
                {messages.shell.language.label}
            </span>

            <select
                aria-label={
                    messages.shell.language.label
                }
                value={language}
                onChange={(event) =>
                    handleChange(
                        event.target.value
                    )
                }
                style={{
                    minHeight: "36px",
                    border: "1px solid #d0d5dd",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#172033",
                    padding: "0 30px 0 10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                }}
            >
                <option value="en">
                    {
                        messages.shell.language
                            .english
                    }
                </option>

                <option value="es">
                    {
                        messages.shell.language
                            .spanish
                    }
                </option>
            </select>
        </label>
    );
}
