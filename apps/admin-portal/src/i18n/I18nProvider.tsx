import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode
} from "react";

import {
    resolveLanguage,
    type SupportedLanguage
} from "./language.js";

import {
    en,
    translations,
    type TranslationCatalog,
    type TranslationKey,
    type TranslationParameters
} from "./locales/index.js";

type I18nContextValue = {
    language: SupportedLanguage;
    locale: string;
    messages: TranslationCatalog;
    t: (
        key: TranslationKey,
        parameters?: TranslationParameters
    ) => string;
    setLanguage:
        (language: SupportedLanguage) => void;
};

type I18nProviderProps = {
    children: ReactNode;
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

function readTranslation(
    catalog: TranslationCatalog,
    key: TranslationKey
): string | undefined {
    let current: unknown = catalog;

    for (const segment of key.split(".")) {
        if (
            typeof current !== "object" ||
            current === null ||
            !(segment in current)
        ) {
            return undefined;
        }

        current = (
            current as Record<string, unknown>
        )[segment];
    }

    return typeof current === "string"
        ? current
        : undefined;
}

function interpolate(
    template: string,
    parameters?: TranslationParameters
): string {
    if (!parameters) {
        return template;
    }

    return template.replace(
        /\{([A-Za-z0-9_]+)\}/g,
        (match, name: string) => {
            const value = parameters[name];

            return value === undefined
                ? match
                : String(value);
        }
    );
}

export function I18nProvider({
    children,
    userPreferredLanguage,
    tenantDefaultLanguage
}: I18nProviderProps) {
    const resolvedLanguage =
        resolveLanguage({
            userPreferredLanguage,
            tenantDefaultLanguage
        });

    const [
        language,
        setLanguageState
    ] = useState<SupportedLanguage>(
        resolvedLanguage
    );

    useEffect(() => {
        setLanguageState(
            resolvedLanguage
        );
    }, [resolvedLanguage]);

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

    const t =
        useCallback(
            (
                key: TranslationKey,
                parameters?: TranslationParameters
            ): string => {
                const localized =
                    readTranslation(
                        translations[language],
                        key
                    );

                const fallback =
                    readTranslation(
                        en,
                        key
                    );

                return interpolate(
                    localized ??
                        fallback ??
                        key,
                    parameters
                );
            },
            [language]
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
                t,
                setLanguage
            }),
            [
                language,
                setLanguage,
                t
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
