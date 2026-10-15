export {
    I18nProvider,
    useI18n
} from "./I18nProvider.js";

export {
    LanguageSelector
} from "./LanguageSelector.js";

export {
    SYSTEM_DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    isSupportedLanguage,
    normalizeLanguage,
    resolveLanguage
} from "./language.js";

export type {
    LanguageResolutionInput,
    SupportedLanguage
} from "./language.js";

export type {
    TranslationCatalog,
    TranslationKey,
    TranslationParameters
} from "./locales/index.js";