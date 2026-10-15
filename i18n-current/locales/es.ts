import type { TranslationCatalog } from "./en.js";

export const es: TranslationCatalog = {
    common: {
        actions: {
            add: "Agregar",
            cancel: "Cancelar",
            close: "Cerrar",
            edit: "Editar",
            remove: "Eliminar",
            save: "Guardar",
            saving: "Guardando..."
        },

        status: {
            active: "Activo",
            inactive: "Inactivo",
            deceased: "Fallecido"
        },

        pagination: {
            showing: "Mostrando",
            of: "de",
            previousPage: "Página anterior",
            nextPage: "Página siguiente"
        }
    },

    shell: {
        enterpriseIntelligenceSystem:
            "Sistema de Inteligencia Empresarial",

        workspace: "Espacio de trabajo",
        platform: "Plataforma",
        administration: "Administración",

        environment: {
            enterprise: "Empresa",
            production: "Producción"
        },

        navigation: {
            dashboard: "Panel",
            athena: "Athena",
            compliance: "Cumplimiento",
            workflow: "Flujo de trabajo",
            security: "Seguridad",
            aiHub: "Centro de IA",
            administration: "Administración",
            audit: "Auditoría"
        },

        language: {
            label: "Idioma",
            english: "Inglés",
            spanish: "Español"
        }
    },

    athena: {
        people: {
            title: "Personas",
            description:
                "Gestione personas, pacientes, profesionales, identificadores, información de contacto y afiliaciones a centros.",

            newPerson: "Nueva persona",
            person: "Persona",
            patient: "Paciente",
            practitioner: "Profesional",
            patientPractitioner:
                "Paciente / Profesional",

            searchPlaceholder:
                "Buscar personas...",

            exportCsv: "Exportar CSV",

            table: {
                name: "Nombre",
                type: "Tipo",
                identifier: "Identificador",
                facility: "Centro",
                status: "Estado",
                lastUpdated:
                    "Última actualización"
            },

            empty: {
                noPeople:
                    "No hay personas registradas en Athena.",
                noSearchResults:
                    "Ninguna persona coincide con la búsqueda."
            },

            sections: {
                demographics:
                    "Datos demográficos",
                identifiers:
                    "Identificadores",
                contactInformation:
                    "Información de contacto",
                facilityAffiliations:
                    "Afiliaciones a centros",
                addresses:
                    "Direcciones",
                recordInformation:
                    "Información del registro"
            },

            fields: {
                firstName: "Nombre",
                middleName: "Segundo nombre",
                lastName: "Apellido",
                preferredName:
                    "Nombre preferido",
                dateOfBirth:
                    "Fecha de nacimiento",
                sex: "Sexo",
                gender: "Género",
                email: "Correo electrónico",
                phone: "Teléfono",
                mobilePhone: "Teléfono móvil",
                system: "Sistema",
                value: "Valor",
                addressLine1:
                    "Dirección, línea 1",
                addressLine2:
                    "Dirección, línea 2",
                city: "Ciudad",
                provinceOrState:
                    "Provincia / Estado",
                postalCode:
                    "Código postal",
                country: "País",
                facility: "Centro",
                affiliationType:
                    "Tipo de afiliación",
                primary: "Principal",
                created: "Creado",
                updated: "Actualizado",
                version: "Versión"
            },

            sex: {
                unknown: "Desconocido",
                male: "Masculino",
                female: "Femenino",
                intersex: "Intersexual",
                other: "Otro"
            },

            affiliation: {
                patientCare:
                    "Atención al paciente",
                practitionerAssignment:
                    "Asignación profesional",
                general: "General"
            },

            messages: {
                created:
                    "Persona creada correctamente.",

                updated:
                    "La persona y las afiliaciones a centros se actualizaron correctamente.",

                requiredName:
                    "El nombre y el apellido son obligatorios.",

                identifierRequired:
                    "Cada identificador debe incluir un sistema y un valor.",

                addressRequired:
                    "Cada dirección debe incluir la línea 1, la ciudad y el país.",

                facilityRequired:
                    "Cada afiliación debe seleccionar un centro.",

                onePrimaryFacility:
                    "Solo una afiliación a centro puede ser principal.",

                duplicateAffiliation:
                    "No se puede agregar más de una vez el mismo centro y tipo de afiliación.",

                concurrentUpdate:
                    "Esta persona fue modificada por otra actualización. Cierre y vuelva a abrir el registro antes de intentarlo nuevamente.",

                unableToLoad:
                    "No se pudieron cargar las personas.",

                unableToSave:
                    "No se pudo guardar la persona."
            }
        }
    }
};
