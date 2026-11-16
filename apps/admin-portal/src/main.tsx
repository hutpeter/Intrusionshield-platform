import { AccountSetupScreen, takeAccountSetupToken } from "./auth/AccountSetupScreen.js";
import {
    StrictMode
} from "react";

import {
    createRoot
} from "react-dom/client";

import App from "./App.js";

import "./styles.css";

import {
    AuthProvider
} from "./auth/index.js";

import {
    AuthGate
} from "./auth/AuthGate.js";

import {
    AuthenticatedI18nProvider
} from "./i18n/index.js";

const setupToken = takeAccountSetupToken();

createRoot(
    document.getElementById(
        "root"
    )!
).render(
    <StrictMode>
        {setupToken ? <AccountSetupScreen token={setupToken} /> : <AuthProvider>
            <AuthGate>
                <AuthenticatedI18nProvider>
                    <App />
                </AuthenticatedI18nProvider>
            </AuthGate>
        </AuthProvider>}
    </StrictMode>
);
