import type {
    ReactNode
} from "react";

import {
    useAuth
} from "./AuthProvider.js";

import {
    LoginScreen
} from "./LoginScreen.js";

type AuthGateProps = {
    children: ReactNode;
};

export function AuthGate({
    children
}: AuthGateProps) {
    const {
        identity
    } = useAuth();

    if (!identity) {
        return <LoginScreen />;
    }

    return <>{children}</>;
}
