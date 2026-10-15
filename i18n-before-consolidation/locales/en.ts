export const en = {
    common: {
        actions: {
            add: "Add",
            cancel: "Cancel",
            close: "Close",
            edit: "Edit",
            remove: "Remove",
            save: "Save",
            saving: "Saving..."
        },

        status: {
            active: "Active",
            inactive: "Inactive",
            deceased: "Deceased"
        },

        pagination: {
            showing: "Showing",
            of: "of",
            previousPage: "Previous page",
            nextPage: "Next page"
        }
    },

    shell: {
        enterpriseIntelligenceSystem:
            "Enterprise Intelligence System",

        workspace: "Workspace",
        platform: "Platform",
        administration: "Administration",

        environment: {
            enterprise: "Enterprise",
            production: "Production"
        },

        navigation: {
            dashboard: "Dashboard",
            athena: "Athena",
            compliance: "Compliance",
            workflow: "Workflow",
            security: "Security",
            aiHub: "AI Hub",
            administration: "Administration",
            audit: "Audit"
        },

        language: {
            label: "Language",
            english: "English",
            spanish: "Spanish"
        }
    },

    athena: {
        people: {
            title: "People",
            description:
                "Manage people, patients, practitioners, identifiers, contact information, and Facility affiliations.",

            newPerson: "New Person",
            person: "Person",
            patient: "Patient",
            practitioner: "Practitioner",
            patientPractitioner:
                "Patient / Practitioner",

            searchPlaceholder:
                "Search people...",

            exportCsv: "Export CSV",

            table: {
                name: "Name",
                type: "Type",
                identifier: "Identifier",
                facility: "Facility",
                status: "Status",
                lastUpdated: "Last Updated"
            },

            empty: {
                noPeople:
                    "No persons are registered in Athena.",
                noSearchResults:
                    "No persons match your search."
            },

            sections: {
                demographics: "Demographics",
                identifiers: "Identifiers",
                contactInformation:
                    "Contact information",
                facilityAffiliations:
                    "Facility Affiliations",
                addresses: "Addresses",
                recordInformation:
                    "Record information"
            },

            fields: {
                firstName: "First name",
                middleName: "Middle name",
                lastName: "Last name",
                preferredName: "Preferred name",
                dateOfBirth: "Date of birth",
                sex: "Sex",
                gender: "Gender",
                email: "Email",
                phone: "Phone",
                mobilePhone: "Mobile phone",
                system: "System",
                value: "Value",
                addressLine1: "Address line 1",
                addressLine2: "Address line 2",
                city: "City",
                provinceOrState:
                    "Province / State",
                postalCode: "Postal code",
                country: "Country",
                facility: "Facility",
                affiliationType:
                    "Affiliation type",
                primary: "Primary",
                created: "Created",
                updated: "Updated",
                version: "Version"
            },

            sex: {
                unknown: "Unknown",
                male: "Male",
                female: "Female",
                intersex: "Intersex",
                other: "Other"
            },

            affiliation: {
                patientCare: "Patient care",
                practitionerAssignment:
                    "Practitioner assignment",
                general: "General"
            },

            messages: {
                created:
                    "Person created successfully.",
                updated:
                    "Person and Facility affiliations updated successfully.",

                requiredName:
                    "First name and last name are required.",

                identifierRequired:
                    "Every identifier must include both a system and a value.",

                addressRequired:
                    "Every address must include address line 1, city, and country.",

                facilityRequired:
                    "Every Facility affiliation must select a Facility.",

                onePrimaryFacility:
                    "Only one Facility affiliation can be primary.",

                duplicateAffiliation:
                    "The same Facility and affiliation type cannot be added more than once.",

                concurrentUpdate:
                    "This Person was changed by another update. Close and reopen the record before trying again.",

                unableToLoad:
                    "Unable to load persons.",

                unableToSave:
                    "Unable to save Person."
            }
        }
    }
} as const;

/**
 * Recursively widens the canonical English catalog from literal strings
 * such as "Save" to string while preserving the complete key structure.
 *
 * This makes English the compile-time source of truth for translation keys
 * without requiring other languages to contain the same literal values.
 */
type WidenTranslationValues<T> = {
    readonly [K in keyof T]:
        T[K] extends string
            ? string
            : T[K] extends Record<string, unknown>
                ? WidenTranslationValues<T[K]>
                : T[K];
};

export type TranslationCatalog =
    WidenTranslationValues<typeof en>;

