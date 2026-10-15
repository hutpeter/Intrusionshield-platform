import type {
    SupportedLanguage
} from "../language.js";

import {
    en,
    type TranslationCatalog
} from "./en.js";

import { es } from "./es.js";

export type {
    TranslationCatalog
};

export const translations:
    Record<
        SupportedLanguage,
        TranslationCatalog
    > = {
        en,
        es
    };
