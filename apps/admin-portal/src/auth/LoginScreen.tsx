import {
    useState,
    type FormEvent
} from "react";

import {
    useAuth
} from "./AuthProvider.js";

const LOCAL_DEVELOPMENT_TENANT_ID =
    "11111111-1111-4111-8111-111111111111";

export function LoginScreen() {
    const {
        login,
        loading,
        error
    } = useAuth();

    const [
        tenantId,
        setTenantId
    ] =
        useState(
            LOCAL_DEVELOPMENT_TENANT_ID
        );

    const [
        username,
        setUsername
    ] = useState("");

    const [
        password,
        setPassword
    ] = useState("");

    const handleSubmit =
        async (
            event: FormEvent<HTMLFormElement>
        ): Promise<void> => {
            event.preventDefault();

            if (
                !tenantId.trim() ||
                !username.trim() ||
                !password
            ) {
                return;
            }

            await login({
                tenantId,
                username,
                password
            });
        };

    return (
        <main className="login-page">
            <section
                className="login-card"
                aria-labelledby="login-title"
            >
                <div className="login-brand">
                    <div
                        className="login-brand-mark"
                        aria-hidden="true"
                    >
                        R
                    </div>

                    <div>
                        <div className="login-platform">
                            Ruby
                        </div>
                        <div className="login-company">
                            by Maverick IT
                        </div>
                        <div className="login-product">
                            Athena Hospital Information System
                        </div>
                    </div>
                </div>

                <div className="login-heading">
                    <h1 id="login-title">
                        Sign in
                    </h1>
                    <p>
                        Enter your organization and user credentials.
                    </p>
                </div>

                <form
                    className="login-form"
                    onSubmit={handleSubmit}
                >
                    <label className="login-field">
                        <span>
                            Tenant ID
                        </span>
                        <input
                            type="text"
                            value={tenantId}
                            onChange={
                                event =>
                                    setTenantId(
                                        event.target.value
                                    )
                            }
                            autoComplete="organization"
                            spellCheck={false}
                            disabled={loading}
                            required
                        />
                    </label>

                    <label className="login-field">
                        <span>
                            Username
                        </span>
                        <input
                            type="text"
                            value={username}
                            onChange={
                                event =>
                                    setUsername(
                                        event.target.value
                                    )
                            }
                            autoComplete="username"
                            autoFocus
                            spellCheck={false}
                            disabled={loading}
                            required
                        />
                    </label>

                    <label className="login-field">
                        <span>
                            Password
                        </span>
                        <input
                            type="password"
                            value={password}
                            onChange={
                                event =>
                                    setPassword(
                                        event.target.value
                                    )
                            }
                            autoComplete="current-password"
                            disabled={loading}
                            required
                        />
                    </label>

                    {error && (
                        <div
                            className="login-error"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        className="login-submit"
                        type="submit"
                        disabled={
                            loading ||
                            !tenantId.trim() ||
                            !username.trim() ||
                            !password
                        }
                    >
                        {loading
                            ? "Signing in..."
                            : "Sign in"}
                    </button>
                </form>
            </section>
        </main>
    );
}
