import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode
} from "react";

import type {
    SupportedLanguage
} from "../i18n/language.js";

export type AuthenticatedIdentity = {
    identityId: string;
    tenantId: string;
    identityType: string;
    displayName: string;
    language: SupportedLanguage;
    locale?: string;
    countryCode?: string;
    timeZone?: string;
};

export type AuthenticatedInternationalization = {
    language: SupportedLanguage;
    languageSource:
        | "USER"
        | "TENANT"
        | "SYSTEM";
    locale?: string;
    countryCode?: string;
    timeZone?: string;
};

export type LoginCredentials = {
    tenantId: string;
    username: string;
    password: string;
};

type LoginResponse = {
    accessToken: string;
    expiresAt: number;
    identity: AuthenticatedIdentity;
    internationalization:
        AuthenticatedInternationalization;
};

type AuthContextValue = {
    loading: boolean;
    error: string | null;
    accessToken: string | null;
    identity: AuthenticatedIdentity | null;
    internationalization:
        AuthenticatedInternationalization | null;
    login:
        (
            credentials: LoginCredentials
        ) => Promise<boolean>;
    logout: () => void;
    setPreferredLanguage:
        (
            language: SupportedLanguage
        ) => Promise<void>;
};

type AuthProviderProps = {
    children: ReactNode;
};

const AuthContext =
    createContext<AuthContextValue | null>(
        null
    );

async function authenticate(
    credentials: LoginCredentials
): Promise<LoginResponse> {
    const response =
        await fetch(
            "/api/v1/auth/login",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    tenantId:
                        credentials.tenantId.trim(),
                    username:
                        credentials.username.trim(),
                    password:
                        credentials.password
                })
            }
        );

    if (!response.ok) {
        let message =
            response.status === 401
                ? "Invalid tenant, username, or password."
                : `Authentication failed (${response.status}).`;

        try {
            const body =
                await response.json() as {
                    error?: string;
                    message?: string;
                };

            if (body.error) {
                message = body.error;
            } else if (body.message) {
                message = body.message;
            }
        } catch {
            // Keep the HTTP status message.
        }

        throw new Error(message);
    }

    return await response.json() as LoginResponse;
}

export function AuthProvider({
    children
}: AuthProviderProps) {
    const [
        session,
        setSession
    ] =
        useState<LoginResponse | null>(
            null
        );

    const [
        loading,
        setLoading
    ] =
        useState(false);

    const [
        error,
        setError
    ] =
        useState<string | null>(
            null
        );

    const login =
        useCallback(
            async (
                credentials:
                    LoginCredentials
            ): Promise<boolean> => {
                setLoading(true);
                setError(null);

                try {
                    const result =
                        await authenticate(
                            credentials
                        );

                    setSession(result);

                    return true;
                } catch (caught) {
                    setSession(null);

                    setError(
                        caught instanceof Error
                            ? caught.message
                            : "Authentication failed."
                    );

                    return false;
                } finally {
                    setLoading(false);
                }
            },
            []
        );

    const logout =
        useCallback(
            (): void => {
                setSession(null);
                setError(null);
                setLoading(false);
            },
            []
        );

    const setPreferredLanguage =
        useCallback(
            async (
                language:
                    SupportedLanguage
            ) => {
                if (!session) {
                    throw new Error(
                        "No authenticated session."
                    );
                }

                const response =
                    await fetch(
                        "/api/v1/auth/me/language",
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type":
                                    "application/json",
                                Authorization:
                                    `Bearer ${session.accessToken}`
                            },
                            body:
                                JSON.stringify({
                                    language
                                })
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        `Language update failed (${response.status}).`
                    );
                }

                /*
                 * Do not re-authenticate here because the password is
                 * deliberately not retained by the client. The server has
                 * persisted the preference; update the active UI/session
                 * context immediately. A future token refresh endpoint can
                 * issue a new JWT without retaining credentials.
                 */
                setSession(
                    current =>
                        current
                            ? {
                                ...current,
                                identity: {
                                    ...current.identity,
                                    language
                                },
                                internationalization: {
                                    ...current.internationalization,
                                    language,
                                    languageSource:
                                        "USER"
                                }
                            }
                            : current
                );
            },
            [session]
        );

    const value =
        useMemo<AuthContextValue>(
            () => ({
                loading,
                error,
                accessToken:
                    session?.accessToken ??
                    null,
                identity:
                    session?.identity ??
                    null,
                internationalization:
                    session
                        ?.internationalization ??
                    null,
                login,
                logout,
                setPreferredLanguage
            }),
            [
                loading,
                error,
                session,
                login,
                logout,
                setPreferredLanguage
            ]
        );

    return (
        <AuthContext.Provider
            value={value}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth():
    AuthContextValue {
    const context =
        useContext(AuthContext);

    if (!context) {
        throw new Error(
            "useAuth must be used within an AuthProvider."
        );
    }

    return context;
}
