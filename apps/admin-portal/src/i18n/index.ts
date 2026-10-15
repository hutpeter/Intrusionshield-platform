export {
    I18nProvider,
    useI18n
} from "./I18nProvider.js";

export {
    AuthenticatedI18nProvider
} from "./AuthenticatedI18nProvider.js";

export {
    LanguageSelector
} from "./LanguageSelector.js";

export {
    SUPPORTED_LANGUAGES,
    isSupportedLanguage,
    normalizeLanguage,
    resolveLanguage,
    type SupportedLanguage
} from "./language.js";

export {
    en,
    es,
    translations,
    type TranslationCatalog,
    type TranslationKey,
    type TranslationParameters
} from "./locales/index.js";
