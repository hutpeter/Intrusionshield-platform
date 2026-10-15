import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode
} from "react";

import {
    resolveLanguage,
    type SupportedLanguage
} from "./language.js";

import {
    translations,
    type TranslationCatalog
} from "./locales/catalog.js";

type I18nContextValue = {
    language: SupportedLanguage;
    locale: string;
    messages: TranslationCatalog;
    setLanguage:
        (language: SupportedLanguage) => void;
};

type I18nProviderProps = {
    children: ReactNode;

    /*
     * These values will later come from the authenticated
     * EIS identity/token and tenant configuration.
     */
    userPreferredLanguage?: string | null;
    tenantDefaultLanguage?: string | null;
};

const localeByLanguage:
    Record<SupportedLanguage, string> = {
        en: "en-CA",
        es: "es"
    };

const I18nContext =
    createContext<I18nContextValue | null>(
        null
    );

export function I18nProvider({
    children,
    userPreferredLanguage,
    tenantDefaultLanguage
}: I18nProviderProps) {
    const initialLanguage =
        resolveLanguage({
            userPreferredLanguage,
            tenantDefaultLanguage
        });

    const [
        language,
        setLanguageState
    ] = useState<SupportedLanguage>(
        initialLanguage
    );

    const setLanguage =
        useCallback(
            (
                nextLanguage:
                    SupportedLanguage
            ) => {
                setLanguageState(
                    nextLanguage
                );
            },
            []
        );

    const value =
        useMemo<I18nContextValue>(
            () => ({
                language,
                locale:
                    localeByLanguage[
                        language
                    ],
                messages:
                    translations[
                        language
                    ],
                setLanguage
            }),
            [
                language,
                setLanguage
            ]
        );

    return (
        <I18nContext.Provider
            value={value}
        >
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n():
    I18nContextValue {
    const context =
        useContext(I18nContext);

    if (!context) {
        throw new Error(
            "useI18n must be used within an I18nProvider."
        );
    }

    return context;
}
