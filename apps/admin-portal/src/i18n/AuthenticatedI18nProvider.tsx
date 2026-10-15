import {
    type ReactNode
} from "react";

import {
    useAuth
} from "../auth/index.js";

import {
    I18nProvider
} from "./I18nProvider.js";

type AuthenticatedI18nProviderProps = {
    children: ReactNode;
};

export function AuthenticatedI18nProvider({
    children
}: AuthenticatedI18nProviderProps) {
    const {
        loading,
        error,
        internationalization
    } = useAuth();

    if (loading) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    fontFamily:
                        "Inter, Arial, sans-serif",
                    color: "#475467"
                }}
            >
                Loading EIS...
            </div>
        );
    }

    if (
        error ||
        !internationalization
    ) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    fontFamily:
                        "Inter, Arial, sans-serif",
                    color: "#b42318"
                }}
            >
                {error ??
                    "Authentication context is unavailable."}
            </div>
        );
    }

    return (
        <I18nProvider
            userPreferredLanguage={
                internationalization.language
            }
        >
            {children}
        </I18nProvider>
    );
}
