import {
    useState
} from "react";

import {
    useAuth
} from "../auth/index.js";

import {
    useI18n
} from "./I18nProvider.js";

import type {
    SupportedLanguage
} from "./language.js";

export function LanguageSelector() {
    const {
        language,
        t
    } = useI18n();

    const {
        setPreferredLanguage
    } = useAuth();

    const [
        updating,
        setUpdating
    ] =
        useState(false);

    const handleChange =
        async (
            value: string
        ) => {
            const nextLanguage =
                value as SupportedLanguage;

            if (
                nextLanguage ===
                language
            ) {
                return;
            }

            setUpdating(true);

            try {
                await setPreferredLanguage(
                    nextLanguage
                );
            } catch (error) {
                console.error(
                    "Unable to update language.",
                    error
                );
            } finally {
                setUpdating(false);
            }
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
                {t(
                    "shell.language.label"
                )}
            </span>

            <select
                aria-label={
                    t(
                        "shell.language.label"
                    )
                }
                value={language}
                disabled={updating}
                onChange={(event) => {
                    void handleChange(
                        event.target.value
                    );
                }}
                style={{
                    minHeight: "36px",
                    border:
                        "1px solid #d0d5dd",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#172033",
                    padding:
                        "0 30px 0 10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor:
                        updating
                            ? "wait"
                            : "pointer"
                }}
            >
                <option value="en">
                    {t(
                        "shell.language.english"
                    )}
                </option>

                <option value="es">
                    {t(
                        "shell.language.spanish"
                    )}
                </option>
            </select>
        </label>
    );
}
