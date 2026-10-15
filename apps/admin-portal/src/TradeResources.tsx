import {

    useCallback,

    useEffect,

    useMemo,

    useState

} from "react";



import "./TradeResources.css";

import { useDraggableDialog } from "./ui/useDraggableDialog";



type TradeResourceType =

    | "EMPLOYEE"

    | "VENDOR"

    | "CONTRACTOR";



type TradeResourceStatus =

    | "ACTIVE"

    | "INACTIVE";



type SkillProficiency =

    | "APPRENTICE"

    | "QUALIFIED"

    | "EXPERT";



interface Skill {

    readonly id: string;

    readonly tenantId: string;

    readonly code: string;

    readonly name: string;

    readonly status: string;

}



interface ResourceSkill {

    readonly id: string;

    readonly tenantId: string;

    readonly resourceId: string;

    readonly skillId: string;

    readonly skillCode: string;

    readonly skillName: string;

    readonly proficiency?: SkillProficiency;

    readonly certificationName?: string;

    readonly certificationNumber?: string;

    readonly certificationExpiresAt?: string;

    readonly createdAt: string;

}



interface TradeResource {

    readonly id: string;

    readonly tenantId: string;

    readonly resourceNumber: string;

    readonly firstName: string;

    readonly lastName: string;

    readonly trade: string;

    readonly resourceType: TradeResourceType;

    readonly employerName?: string;

    readonly email?: string;

    readonly phone?: string;

    readonly serviceRegion?: string;
    readonly administrativeRegionCode?: string;
    readonly serviceAreaId?: string;

    readonly countryCode?: string;

    readonly hourlyRate?: number;

    readonly currency?: string;

    readonly status: TradeResourceStatus;

    readonly notes?: string;

    readonly createdAt: string;

    readonly updatedAt: string;

    readonly version: number;

    readonly skills: readonly ResourceSkill[];

}



interface CalendarEntry {

    readonly id: string;

    readonly tenantId: string;

    readonly resourceId: string;

    readonly maintenanceActivityId?: string;

    readonly entryType: string;

    readonly title: string;

    readonly startAt: string;

    readonly endAt: string;

    readonly status: string;

    readonly notes?: string;

}




type CalendarEntryType =
    | "MAINTENANCE"
    | "WORK_ORDER"
    | "INSPECTION"
    | "UNAVAILABLE"
    | "OTHER";

type CalendarEntryStatus =
    | "TENTATIVE"
    | "CONFIRMED";

interface AvailabilityResult {
    readonly resourceId: string;
    readonly startAt: string;
    readonly endAt: string;
    readonly available: boolean;
    readonly conflicts: readonly CalendarEntry[];
}

interface ScheduleForm {
    date: string;
    startTime: string;
    endTime: string;
    entryType: CalendarEntryType;
    status: CalendarEntryStatus;
    title: string;
    notes: string;
}

function localDateValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function emptyScheduleForm(): ScheduleForm {
    return {
        date: localDateValue(new Date()),
        startTime: "09:00",
        endTime: "10:00",
        entryType: "MAINTENANCE",
        status: "CONFIRMED",
        title: "",
        notes: ""
    };
}

interface CountryReference {
    readonly code: string;
    readonly alpha3Code: string;
    readonly name: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale?: string;
}

interface CurrencyReference {
    readonly code: string;
    readonly name: string;
    readonly symbol?: string;
    readonly decimalPlaces: number;
}

interface AdministrativeRegionReference {
    readonly countryCode: string;
    readonly code: string;
    readonly name: string;
    readonly regionType?: string;
}

interface ServiceAreaReference {
    readonly id: string;
    readonly countryCode: string;
    readonly regionCode: string;
    readonly code: string;
    readonly name: string;
}

interface RegionalConfiguration {
    readonly defaultCountryCode: string;
    readonly defaultCurrencyCode: string;
    readonly defaultLocale?: string;
    readonly defaultTimeZone?: string;
    readonly countries: readonly CountryReference[];
    readonly currencies: readonly CurrencyReference[];
    readonly administrativeRegions: readonly AdministrativeRegionReference[];
    readonly serviceAreas: readonly ServiceAreaReference[];
}

interface TradeResourcesProps {

    readonly tenantId: string;

}



interface ResourceForm {


    firstName: string;

    lastName: string;

    trade: string;

    resourceType: TradeResourceType;

    employerName: string;

    email: string;

    phone: string;

    serviceRegion: string;
    administrativeRegionCode: string;
    serviceAreaId: string;

    countryCode: string;

    hourlyRate: string;

    currency: string;

    status: TradeResourceStatus;

    notes: string;

    skillIds: string[];

}



const EMPTY_FORM: ResourceForm = {


    firstName: "",

    lastName: "",

    trade: "",

    resourceType: "EMPLOYEE",

    employerName: "",

    email: "",

    phone: "",

    serviceRegion: "",
    administrativeRegionCode: "",
    serviceAreaId: "",

    countryCode: "",

    hourlyRate: "",

    currency: "",

    status: "ACTIVE",

    notes: "",

    skillIds: []

};



async function apiRequest<T>(

    url: string,

    tenantId: string,

    options?: RequestInit

): Promise<T> {

    const response = await fetch(

        url,

        {

            ...options,

            headers: {

                "Content-Type": "application/json",

                "x-tenant-id": tenantId,

                ...(options?.headers ?? {})

            }

        }

    );



    if (!response.ok) {

        let message =

            `${response.status} ${response.statusText}`;



        try {

            const payload =

                await response.json() as {

                    error?: string;

                };



            if (payload.error) {

                message = payload.error;

            }

        } catch {

            // Keep HTTP status message.

        }



        throw new Error(message);

    }



    return await response.json() as T;

}



function formatDateTime(

    value: string

): string {

    const date = new Date(value);



    if (Number.isNaN(date.getTime())) {

        return value;

    }



    return date.toLocaleString();

}



function fullName(

    resource: TradeResource

): string {

    return `${resource.firstName} ${resource.lastName}`;

}



const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 19;

function startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
    result.setHours(0, 0, 0, 0);
    return result;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function timeValue(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
    ).padStart(2, "0")}`;
}

export function TradeResources({

    tenantId

}: TradeResourcesProps) {

    const [

        activeTab,

        setActiveTab

    ] = useState<"resources" | "skills">(

        "resources"

    );



    const [

        resources,

        setResources

    ] = useState<TradeResource[]>([]);



    const [

        skills,

        setSkills

    ] = useState<Skill[]>([]);

    const [
        regionalConfiguration,
        setRegionalConfiguration
    ] = useState<RegionalConfiguration>();




    const [

        selectedResourceId,

        setSelectedResourceId

    ] = useState<string>();



    const [

        calendar,

        setCalendar

    ] = useState<CalendarEntry[]>([]);

    const [
        showSchedule,
        setShowSchedule
    ] = useState(false);

    const [
        showFullSchedule,
        setShowFullSchedule
    ] = useState(false);

    const fullScheduleDrag =
        useDraggableDialog(showFullSchedule);

    const scheduleDialogDrag =
        useDraggableDialog(showSchedule);

    const [
        scheduleForm,
        setScheduleForm
    ] = useState<ScheduleForm>(
        emptyScheduleForm()
    );

    const [
        scheduleSaving,
        setScheduleSaving
    ] = useState(false);

    const [
        scheduleError,
        setScheduleError
    ] = useState<string>();

    const [
        availability,
        setAvailability
    ] = useState<AvailabilityResult>();

    const [
        scheduleWeekStart,
        setScheduleWeekStart
    ] = useState<Date>(startOfWeek(new Date()));

    const [
    scheduleJumpDate,
    setScheduleJumpDate
] = useState<string>(
    localDateValue(new Date())
);




    const [

        showAddResource,

        setShowAddResource

    ] = useState(false);



    const [

        form,

        setForm

    ] = useState<ResourceForm>(

        EMPTY_FORM

    );



    const [

        loading,

        setLoading

    ] = useState(true);



    const [

        saving,

        setSaving

    ] = useState(false);



    const [

        error,

        setError

    ] = useState<string>();


    const [
        modalError,
        setModalError
    ] = useState<string>();

    const [
        modalPosition,
        setModalPosition
    ] = useState({ x: 0, y: 0 });

    const [
        dragOrigin,
        setDragOrigin
    ] = useState<{
        pointerId: number;
        clientX: number;
        clientY: number;
        startX: number;
        startY: number;
    }>();



    const [

        search,

        setSearch

    ] = useState("");



    const loadData =

        useCallback(

            async () => {

                try {

                    setLoading(true);

                    setError(undefined);



                    const [

                        resourceResult,

                        skillResult,

                        regionalResult

                    ] = await Promise.all([

                        apiRequest<TradeResource[]>(

                            "/api/v1/energy/trade-resources",

                            tenantId

                        ),

                        apiRequest<Skill[]>(

                            "/api/v1/energy/skills",

                            tenantId

                        ),

                        apiRequest<RegionalConfiguration>(

                            "/api/v1/config/regional",

                            tenantId

                        )

                    ]);



                    setResources(

                        Array.isArray(resourceResult)

                            ? resourceResult

                            : []

                    );



                    setSkills(

                        Array.isArray(skillResult)

                            ? skillResult

                            : []

                    );

                    setRegionalConfiguration(
                        regionalResult
                    );

                } catch (loadError) {

                    setError(

                        loadError instanceof Error

                            ? loadError.message

                            : "Unable to load trade resources."

                    );

                } finally {

                    setLoading(false);

                }

            },

            [tenantId]

        );



    useEffect(

        () => {

            void loadData();

        },

        [loadData]

    );



    const selectedResource =

        useMemo(

            () =>

                resources.find(

                    resource =>

                        resource.id ===

                        selectedResourceId

                ),

            [

                resources,

                selectedResourceId

            ]

        );



    const filteredResources =

        useMemo(

            () => {

                const value =

                    search.trim().toLowerCase();



                if (!value) {

                    return resources;

                }



                return resources.filter(

                    resource => {

                        const skillText =

                            resource.skills

                                .map(

                                    skill =>

                                        `${skill.skillCode} ${skill.skillName}`

                                )

                                .join(" ");



                        return [

                            resource.resourceNumber,

                            resource.firstName,

                            resource.lastName,

                            resource.trade,

                            resource.resourceType,

                            resource.employerName ?? "",

                            resource.serviceRegion ?? "",

                            skillText

                        ]

                            .join(" ")

                            .toLowerCase()

                            .includes(value);

                    }

                );

            },

            [

                resources,

                search

            ]

        );



    async function selectResource(

        resource: TradeResource

    ): Promise<void> {

        setSelectedResourceId(

            resource.id

        );



        try {

            const entries =

                await apiRequest<CalendarEntry[]>(

                    `/api/v1/energy/trade-resources/${resource.id}/calendar`,

                    tenantId

                );



            setCalendar(

                Array.isArray(entries)

                    ? entries

                    : []

            );

        } catch (calendarError) {

            setCalendar([]);



            setError(

                calendarError instanceof Error

                    ? calendarError.message

                    : "Unable to load calendar."

            );

        }

    }



    async function reloadCalendar(
        resourceId: string
    ): Promise<void> {
        const entries =
            await apiRequest<CalendarEntry[]>(
                `/api/v1/energy/trade-resources/${resourceId}/calendar`,
                tenantId
            );

        setCalendar(
            Array.isArray(entries)
                ? entries
                : []
        );
    }

    function scheduleDates(): {
        startAt: Date;
        endAt: Date;
    } {
        if (
            !scheduleForm.date ||
            !scheduleForm.startTime ||
            !scheduleForm.endTime
        ) {
            throw new Error(
                "Date, start time, and end time are required."
            );
        }

        const startAt =
            new Date(
                `${scheduleForm.date}T${scheduleForm.startTime}:00`
            );

        const endAt =
            new Date(
                `${scheduleForm.date}T${scheduleForm.endTime}:00`
            );

        if (
            Number.isNaN(startAt.getTime()) ||
            Number.isNaN(endAt.getTime())
        ) {
            throw new Error(
                "Enter a valid schedule date and time."
            );
        }

        if (endAt <= startAt) {
            throw new Error(
                "End time must be after start time."
            );
        }

        return {
            startAt,
            endAt
        };
    }

    async function checkScheduleAvailability(): Promise<void> {
        if (!selectedResource) {
            return;
        }

        try {
            setScheduleError(undefined);

            const {
                startAt,
                endAt
            } = scheduleDates();

            const result =
                await apiRequest<AvailabilityResult>(
                    `/api/v1/energy/trade-resources/${selectedResource.id}/availability?startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(endAt.toISOString())}`,
                    tenantId
                );

            setAvailability(result);
        } catch (availabilityError) {
            setAvailability(undefined);
            setScheduleError(
                availabilityError instanceof Error
                    ? availabilityError.message
                    : "Unable to check availability."
            );
        }
    }

    async function createScheduleEntry(): Promise<void> {
        if (!selectedResource) {
            return;
        }

        try {
            setScheduleSaving(true);
            setScheduleError(undefined);

            const {
                startAt,
                endAt
            } = scheduleDates();

            const availabilityResult =
                await apiRequest<AvailabilityResult>(
                    `/api/v1/energy/trade-resources/${selectedResource.id}/availability?startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(endAt.toISOString())}`,
                    tenantId
                );

            setAvailability(
                availabilityResult
            );

            if (!availabilityResult.available) {
                throw new Error(
                    "This time slot conflicts with an existing booking."
                );
            }

            if (!scheduleForm.title.trim()) {
                throw new Error(
                    "A schedule title is required."
                );
            }

            await apiRequest<CalendarEntry>(
                `/api/v1/energy/trade-resources/${selectedResource.id}/calendar`,
                tenantId,
                {
                    method: "POST",
                    body: JSON.stringify({
                        entryType:
                            scheduleForm.entryType,
                        title:
                            scheduleForm.title.trim(),
                        startAt:
                            startAt.toISOString(),
                        endAt:
                            endAt.toISOString(),
                        status:
                            scheduleForm.status,
                        notes:
                            scheduleForm.notes.trim() ||
                            undefined
                    })
                }
            );

            await reloadCalendar(
                selectedResource.id
            );

            setShowSchedule(false);
            setScheduleForm(
                emptyScheduleForm()
            );
            setAvailability(undefined);
        } catch (scheduleSaveError) {
            setScheduleError(
                scheduleSaveError instanceof Error
                    ? scheduleSaveError.message
                    : "Unable to create schedule entry."
            );
        } finally {
            setScheduleSaving(false);
        }
    }

    function openScheduleFromSlot(
        day: Date,
        hour: number
    ): void {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);

        const end = new Date(start);
        end.setHours(end.getHours() + 1);

        setScheduleForm({
            ...emptyScheduleForm(),
            date: localDateValue(start),
            startTime: timeValue(start),
            endTime: timeValue(end)
        });
        setAvailability(undefined);
        setScheduleError(undefined);
        setShowSchedule(true);
    }

    function updateForm(

        property: keyof ResourceForm,

        value: ResourceForm[keyof ResourceForm]

    ): void {

        setModalError(undefined);

        setForm(

            current => ({

                ...current,

                [property]: value

            })

        );

    }



    function toggleSkill(

        skillId: string

    ): void {

        setModalError(undefined);

        setForm(

            current => ({

                ...current,

                skillIds:

                    current.skillIds.includes(

                        skillId

                    )

                        ? current.skillIds.filter(

                            id => id !== skillId

                        )

                        : [

                            ...current.skillIds,

                            skillId

                        ]

            })

        );

    }



    async function createResource(): Promise<void> {

        try {

            setSaving(true);

            setModalError(undefined);



const firstName =
    form.firstName.trim();

const lastName =
    form.lastName.trim();

const primaryTrade =
    form.trade.trim();

const missingFields: string[] = [];

if (!firstName) {
    missingFields.push("first name");
}

if (!lastName) {
    missingFields.push("last name");
}

if (!primaryTrade) {
    missingFields.push("primary trade");
}

if (!form.countryCode) {
    missingFields.push("country");
}

if (!form.currency) {
    missingFields.push("currency");
}

if (missingFields.length > 0) {
    throw new Error(
        `Required: ${missingFields.join(", ")}.`
    );
}



            const hourlyRate =

                form.hourlyRate.trim()

                    ? Number(form.hourlyRate)

                    : undefined;



            if (

                hourlyRate !== undefined &&

                (

                    !Number.isFinite(hourlyRate) ||

                    hourlyRate < 0

                )

            ) {

                throw new Error(

                    "Hourly rate must be a non-negative number."

                );

            }



            const resource =

                await apiRequest<TradeResource>(

                    "/api/v1/energy/trade-resources",

                    tenantId,

                    {

                        method: "POST",

                        body: JSON.stringify({

                            firstName,

                            lastName,

                            trade: primaryTrade,

                        resourceType:

                                form.resourceType,



                            employerName:

                                form.employerName.trim() ||

                                undefined,



                            email:

                                form.email.trim() ||

                                undefined,



                            phone:

                                form.phone.trim() ||

                                undefined,



                            serviceRegion:

                                form.serviceRegion.trim() ||

                                undefined,



                            countryCode:

                                form.countryCode,

                            administrativeRegionCode:

                                form.administrativeRegionCode || undefined,

                            serviceAreaId:

                                form.serviceAreaId || undefined,



                            hourlyRate,



                            currency:

                                form.currency.trim() ||

                                undefined,



                            status:

                                form.status,



                            notes:

                                form.notes.trim() ||

                                undefined

                        })

                    }

                );



            for (

                const skillId

                of form.skillIds

            ) {

                await apiRequest(

                    `/api/v1/energy/trade-resources/${resource.id}/skills`,

                    tenantId,

                    {

                        method: "POST",

                        body: JSON.stringify({

                            skillId,

                            proficiency:

                                "QUALIFIED"

                        })

                    }

                );

            }



            setForm({
                ...EMPTY_FORM,
                countryCode:
                    regionalConfiguration?.defaultCountryCode ??
                    "",
                currency:
                    regionalConfiguration?.defaultCurrencyCode ??
                    ""
            });



            setShowAddResource(false);



            await loadData();



            setSelectedResourceId(

                resource.id

            );

        } catch (saveError) {

            setModalError(

                saveError instanceof Error

                    ? saveError.message

                    : "Unable to create tradesperson."

            );

        } finally {

            setSaving(false);

        }

    }



    return (

        <section className="trade-resources">

            <header className="trade-resources__header">

                <div>

                    <p className="trade-resources__eyebrow">

                        Ruby EMS / BAS

                    </p>



                    <h2>

                        Tradespeople &amp; Resources

                    </h2>



                    <p>

                        Manage skilled personnel,

                        qualifications and scheduling

                        for maintenance and asset

                        operations.

                    </p>

                </div>



                <button

                    className="trade-resources__primary"

                    type="button"

                    onClick={() => {

                        setForm({
                            ...EMPTY_FORM,
                            countryCode:
                                regionalConfiguration?.defaultCountryCode ??
                                "",
                            currency:
                                regionalConfiguration?.defaultCurrencyCode ??
                                ""
                        });

                        setModalError(undefined);
                        setModalPosition({ x: 0, y: 0 });
                        setShowAddResource(true);

                    }}

                >

                    + Add Tradesperson

                </button>

            </header>



            {error && (

                <div

                    className="trade-resources__error"

                    role="alert"

                >

                    {error}

                </div>

            )}



            <nav

                className="trade-resources__tabs"

                aria-label="Trade resource views"

            >

                <button

                    type="button"

                    className={

                        activeTab === "resources"

                            ? "is-active"

                            : ""

                    }

                    onClick={() =>

                        setActiveTab(

                            "resources"

                        )

                    }

                >

                    Tradespeople

                    <span>

                        {resources.length}

                    </span>

                </button>



                <button

                    type="button"

                    className={

                        activeTab === "skills"

                            ? "is-active"

                            : ""

                    }

                    onClick={() =>

                        setActiveTab(

                            "skills"

                        )

                    }

                >

                    Skills

                    <span>

                        {skills.length}

                    </span>

                </button>

            </nav>



            {activeTab === "resources" && (

                <>

                    <div className="trade-resources__toolbar">

                        <input

                            type="search"

                            value={search}

                            placeholder="Search by name, trade, skill, region..."

                            onChange={event =>

                                setSearch(

                                    event.target.value

                                )

                            }

                        />



                        <button

                            type="button"

                            onClick={() =>

                                void loadData()

                            }

                        >

                            Refresh

                        </button>

                    </div>



                    {loading ? (

                        <div className="trade-resources__empty">

                            Loading tradespeople...

                        </div>

                    ) : (

                        <div className="trade-resources__layout">

                            <div className="trade-resources__table-wrap">

                                <table className="trade-resources__table">

                                    <thead>

                                        <tr>

                                            <th>

                                                Resource #

                                            </th>

                                            <th>

                                                Name

                                            </th>

                                            <th>

                                                Primary Trade

                                            </th>

                                            <th>

                                                Type

                                            </th>

                                            <th>

                                                Region

                                            </th>

                                            <th>

                                                Skills

                                            </th>

                                            <th>

                                                Status

                                            </th>

                                        </tr>

                                    </thead>



                                    <tbody>

                                        {filteredResources.map(

                                            resource => (

                                                <tr

                                                    key={

                                                        resource.id

                                                    }

                                                    className={

                                                        selectedResourceId ===

                                                        resource.id

                                                            ? "is-selected"

                                                            : ""

                                                    }

                                                    onClick={() =>

                                                        void selectResource(

                                                            resource

                                                        )

                                                    }

                                                >

                                                    <td>

                                                        {

                                                            resource.resourceNumber

                                                        }

                                                    </td>



                                                    <td>

                                                        <strong>

                                                            {

                                                                fullName(

                                                                    resource

                                                                )

                                                            }

                                                        </strong>



                                                        {resource.employerName && (

                                                            <small>

                                                                {

                                                                    resource.employerName

                                                                }

                                                            </small>

                                                        )}

                                                    </td>



                                                    <td>

                                                        {

                                                            resource.trade

                                                        }

                                                    </td>



                                                    <td>

                                                        {

                                                            resource.resourceType

                                                        }

                                                    </td>



                                                    <td>

                                                        {

                                                            resource.serviceRegion ??

                                                            "—"

                                                        }

                                                    </td>



                                                    <td>

                                                        <div className="trade-resources__skill-chips">

                                                            {resource.skills

                                                                .slice(

                                                                    0,

                                                                    3

                                                                )

                                                                .map(

                                                                    skill => (

                                                                        <span

                                                                            key={

                                                                                skill.id

                                                                            }

                                                                        >

                                                                            {

                                                                                skill.skillName

                                                                            }

                                                                        </span>

                                                                    )

                                                                )}



                                                            {resource.skills.length >

                                                                3 && (

                                                                <span>

                                                                    +

                                                                    {

                                                                        resource.skills.length -

                                                                        3

                                                                    }

                                                                </span>

                                                            )}

                                                        </div>

                                                    </td>



                                                    <td>

                                                        <span

                                                            className={`trade-resources__status trade-resources__status--${resource.status.toLowerCase()}`}

                                                        >

                                                            {

                                                                resource.status

                                                            }

                                                        </span>

                                                    </td>

                                                </tr>

                                            )

                                        )}



                                        {filteredResources.length ===

                                            0 && (

                                            <tr>

                                                <td

                                                    colSpan={

                                                        7

                                                    }

                                                    className="trade-resources__empty"

                                                >

                                                    No tradespeople

                                                    match the

                                                    current search.

                                                </td>

                                            </tr>

                                        )}

                                    </tbody>

                                </table>

                            </div>



                            {selectedResource && (

                                <aside className="trade-resource-detail">

                                    <div className="trade-resource-detail__heading">

                                        <div>

                                            <span>

                                                {

                                                    selectedResource.resourceNumber

                                                }

                                            </span>



                                            <h3>

                                                {

                                                    fullName(

                                                        selectedResource

                                                    )

                                                }

                                            </h3>



                                            <p>

                                                {

                                                    selectedResource.trade

                                                }

                                            </p>

                                        </div>



                                        <button

                                            type="button"

                                            onClick={() => {

                                                setSelectedResourceId(

                                                    undefined

                                                );

                                                setCalendar(

                                                    []

                                                );

                                            }}

                                        >

                                            ×

                                        </button>

                                    </div>



                                    <dl className="trade-resource-detail__facts">

                                        <div>

                                            <dt>

                                                Type

                                            </dt>

                                            <dd>

                                                {

                                                    selectedResource.resourceType

                                                }

                                            </dd>

                                        </div>



                                        <div>

                                            <dt>

                                                Region

                                            </dt>

                                            <dd>

                                                {

                                                    selectedResource.serviceRegion ??

                                                    "—"

                                                }

                                            </dd>

                                        </div>



                                        <div>

                                            <dt>

                                                Employer

                                            </dt>

                                            <dd>

                                                {

                                                    selectedResource.employerName ??

                                                    "—"

                                                }

                                            </dd>

                                        </div>



                                        <div>

                                            <dt>

                                                Rate

                                            </dt>

                                            <dd>

                                                {selectedResource.hourlyRate !==

                                                undefined

                                                    ? `${selectedResource.currency ?? ""} ${selectedResource.hourlyRate}`

                                                    : "—"}

                                            </dd>

                                        </div>



                                        <div>

                                            <dt>

                                                Email

                                            </dt>

                                            <dd>

                                                {

                                                    selectedResource.email ??

                                                    "—"

                                                }

                                            </dd>

                                        </div>



                                        <div>

                                            <dt>

                                                Phone

                                            </dt>

                                            <dd>

                                                {

                                                    selectedResource.phone ??

                                                    "—"

                                                }

                                            </dd>

                                        </div>

                                    </dl>



                                    <div className="trade-resource-detail__section">

                                        <h4>

                                            Skills &amp;

                                            Qualifications

                                        </h4>



                                        <div className="trade-resource-detail__skills">

                                            {selectedResource.skills.map(

                                                skill => (

                                                    <div

                                                        key={

                                                            skill.id

                                                        }

                                                    >

                                                        <strong>

                                                            {

                                                                skill.skillName

                                                            }

                                                        </strong>



                                                        <span>

                                                            {

                                                                skill.proficiency ??

                                                                "—"

                                                            }

                                                        </span>

                                                    </div>

                                                )

                                            )}



                                            {selectedResource.skills.length ===

                                                0 && (

                                                <p>

                                                    No skills

                                                    assigned.

                                                </p>

                                            )}

                                        </div>

                                    </div>



                                    <div className="trade-resource-detail__section">

                                        <div className="trade-schedule-heading">
                                            <div>
                                                <h4>Schedule</h4>
                                                <p className="trade-schedule-summary">
                                                    {calendar.length === 0
                                                        ? "No calendar entries."
                                                        : `${calendar.length} calendar ${calendar.length === 1 ? "entry" : "entries"}.`}
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                className="trade-schedule-add"
                                                onClick={() =>
                                                    setShowFullSchedule(true)
                                                }
                                            >
                                                Open Schedule
                                            </button>
                                        </div>

                                    </div>


                                    {selectedResource.notes && (

                                        <div className="trade-resource-detail__section">

                                            <h4>

                                                Notes

                                            </h4>

                                            <p>

                                                {

                                                    selectedResource.notes

                                                }

                                            </p>

                                        </div>

                                    )}

                                </aside>

                            )}

                        </div>

                    )}

                </>

            )}



            {activeTab === "skills" && (

                <div className="trade-skills">

                    <div className="trade-skills__heading">

                        <div>

                            <h3>

                                Skills Catalogue

                            </h3>

                            <p>

                                Skills used to match

                                qualified personnel to

                                maintenance and asset

                                activities.

                            </p>

                        </div>

                    </div>



                    <div className="trade-skills__grid">

                        {skills.map(

                            skill => {

                                const assigned =

                                    resources.filter(

                                        resource =>

                                            resource.skills.some(

                                                item =>

                                                    item.skillId ===

                                                    skill.id

                                            )

                                    ).length;



                                return (

                                    <article

                                        key={

                                            skill.id

                                        }

                                    >

                                        <span>

                                            {

                                                skill.code

                                            }

                                        </span>



                                        <h4>

                                            {

                                                skill.name

                                            }

                                        </h4>



                                        <p>

                                            {assigned}{" "}

                                            resource

                                            {assigned ===

                                            1

                                                ? ""

                                                : "s"}

                                        </p>



                                        <strong>

                                            {

                                                skill.status

                                            }

                                        </strong>

                                    </article>

                                );

                            }

                        )}

                    </div>

                </div>

            )}



            {showFullSchedule && selectedResource && (
                <div
                    className="trade-full-schedule-modal"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            setShowFullSchedule(false);
                        }
                    }}
                >
                    <div
                        className="trade-full-schedule-modal__dialog"
                        ref={fullScheduleDrag.dialogRef}
                        style={fullScheduleDrag.dialogStyle}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trade-full-schedule-title"
                    >
                        <div
                            className="trade-full-schedule-modal__header trade-dialog-drag-handle"
                            onMouseDown={fullScheduleDrag.onHeaderMouseDown}
                            title="Drag to move window"
                        >
                            <div>
                                <span>{selectedResource.resourceNumber}</span>
                                <h3 id="trade-full-schedule-title">
                                    Schedule — {fullName(selectedResource)}
                                </h3>
                                <p>
                                    Select an empty time block to create a booking.
                                </p>
                            </div>

                            <div className="trade-full-schedule-modal__header-actions">
                                <button
                                    type="button"
                                    className="trade-schedule-add"
                                    onClick={() => {
                                        setScheduleForm(emptyScheduleForm());
                                        setAvailability(undefined);
                                        setScheduleError(undefined);
                                        setShowSchedule(true);
                                    }}
                                >
                                    + Schedule Slot
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const previousWeek =
                                            addDays(
                                                scheduleWeekStart,
                                                -7
                                            );

                                        setScheduleWeekStart(
                                            previousWeek
                                        );

                                        setScheduleJumpDate(
                                            localDateValue(
                                                previousWeek
                                            )
                                        );
                                    }}
                                >
                                    ← Previous
                                </button>
                            </div>
                        </div>

                                        <div className="trade-week-toolbar">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setScheduleWeekStart(current =>
                                                        addDays(current, -7)
                                                    )
                                                }
                                            >
                                                ← Previous
                                            </button>

                                            <strong>
                                                Week of{" "}
                                                {scheduleWeekStart.toLocaleDateString()}
                                            </strong>

                                        <div className="trade-week-jump">
                                            <label>
                                                <span>Jump to date</span>
                                                <input
                                                    type="date"
                                                    aria-label="Jump to date"
                                                    title="Choose a date to jump to its week"
                                                    value={scheduleJumpDate}
                                                    onChange={event => {
                                                        const value =
                                                            event.currentTarget.value;

                                                        setScheduleJumpDate(
                                                            value
                                                        );

                                                        if (!value) {
                                                            return;
                                                        }

                                                        const [
                                                            year,
                                                            month,
                                                            day
                                                        ] = value
                                                            .split("-")
                                                            .map(Number);

                                                        const selectedDate =
                                                            new Date(
                                                                year,
                                                                month - 1,
                                                                day,
                                                                12,
                                                                0,
                                                                0,
                                                                0
                                                            );

                                                        if (
                                                            Number.isNaN(
                                                                selectedDate.getTime()
                                                            )
                                                        ) {
                                                            return;
                                                        }

                                                        setScheduleWeekStart(
                                                            startOfWeek(
                                                                selectedDate
                                                            )
                                                        );
                                                    }}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const today =
                                                        new Date();

                                                    setScheduleJumpDate(
                                                        localDateValue(
                                                            today
                                                        )
                                                    );

                                                    setScheduleWeekStart(
                                                        startOfWeek(
                                                            today
                                                        )
                                                    );
                                                }}
                                            >
                                                Today
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextWeek =
                                                        addDays(
                                                            scheduleWeekStart,
                                                            7
                                                        );

                                                    setScheduleWeekStart(
                                                        nextWeek
                                                    );

                                                    setScheduleJumpDate(
                                                        localDateValue(
                                                            nextWeek
                                                        )
                                                    );
                                                }}
                                            >
                                                Next →
                                            </button>
                                        </div>
                                        </div>

                                        <div className="trade-week-scroll">
                                            <div className="trade-week-grid">
                                                <div className="trade-week-corner">
                                                    Time
                                                </div>

                                                {Array.from(
                                                    { length: 7 },
                                                    (_, index) =>
                                                        addDays(
                                                            scheduleWeekStart,
                                                            index
                                                        )
                                                ).map(day => (
                                                    <div
                                                        className="trade-week-day"
                                                        key={localDateValue(day)}
                                                    >
                                                        {day.toLocaleDateString(
                                                            undefined,
                                                            {
                                                                weekday: "short",
                                                                month: "short",
                                                                day: "numeric"
                                                            }
                                                        )}
                                                    </div>
                                                ))}

                                                {Array.from(
                                                    {
                                                        length:
                                                            WEEK_END_HOUR -
                                                            WEEK_START_HOUR
                                                    },
                                                    (_, index) =>
                                                        WEEK_START_HOUR + index
                                                ).flatMap(hour => {
                                                    const row: React.ReactNode[] = [
                                                        <div
                                                            className="trade-week-time"
                                                            key={`time-${hour}`}
                                                        >
                                                            {new Date(
                                                                2000,
                                                                0,
                                                                1,
                                                                hour
                                                            ).toLocaleTimeString(
                                                                undefined,
                                                                { hour: "numeric" }
                                                            )}
                                                        </div>
                                                    ];

                                                    for (
                                                        let dayIndex = 0;
                                                        dayIndex < 7;
                                                        dayIndex += 1
                                                    ) {
                                                        const day = addDays(
                                                            scheduleWeekStart,
                                                            dayIndex
                                                        );
                                                        const slotStart =
                                                            new Date(day);
                                                        slotStart.setHours(
                                                            hour,
                                                            0,
                                                            0,
                                                            0
                                                        );
                                                        const slotEnd =
                                                            new Date(slotStart);
                                                        slotEnd.setHours(
                                                            slotEnd.getHours() + 1
                                                        );

                                                        const entries =
                                                            calendar.filter(entry => {
                                                                const entryStart =
                                                                    new Date(
                                                                        entry.startAt
                                                                    );
                                                                const entryEnd =
                                                                    new Date(
                                                                        entry.endAt
                                                                    );

                                                                return (
                                                                    entryStart <
                                                                        slotEnd &&
                                                                    entryEnd >
                                                                        slotStart
                                                                );
                                                            });

                                                        row.push(
                                                            <button
                                                                type="button"
                                                                className={
                                                                    entries.length
                                                                        ? "trade-week-slot is-booked"
                                                                        : "trade-week-slot"
                                                                }
                                                                key={`${localDateValue(
                                                                    day
                                                                )}-${hour}`}
                                                                onClick={() => {
                                                                    if (
                                                                        entries.length ===
                                                                        0
                                                                    ) {
                                                                        openScheduleFromSlot(
                                                                            day,
                                                                            hour
                                                                        );
                                                                    }
                                                                }}
                                                                title={
                                                                    entries.length
                                                                        ? entries
                                                                              .map(
                                                                                  entry =>
                                                                                      entry.title
                                                                              )
                                                                              .join(", ")
                                                                        : "Select this time slot"
                                                                }
                                                            >
                                                                {entries.map(
                                                                    entry => (
                                                                        <span
                                                                            className="trade-week-booking"
                                                                            key={entry.id}
                                                                        >
                                                                            <strong>
                                                                                {
                                                                                    entry.title
                                                                                }
                                                                            </strong>
                                                                            <small>
                                                                                {timeValue(
                                                                                    new Date(
                                                                                        entry.startAt
                                                                                    )
                                                                                )}
                                                                                {"–"}
                                                                                {timeValue(
                                                                                    new Date(
                                                                                        entry.endAt
                                                                                    )
                                                                                )}
                                                                            </small>
                                                                        </span>
                                                                    )
                                                                )}
                                                            </button>
                                                        );
                                                    }

                                                    return row;
                                                })}
                                            </div>
                                        </div>

                                        {calendar.length === 0 ? (
                                            <p>
                                                No calendar entries. Select an
                                                empty time block above to create
                                                the first booking.
                                            </p>
                                        ) : (
                                            <details className="trade-calendar-list">
                                                <summary>
                                                    Calendar entries (
                                                    {calendar.length})
                                                </summary>
                                                <div className="trade-resource-detail__calendar">
                                                    {calendar.map(entry => (
                                                        <article key={entry.id}>
                                                            <strong>
                                                                {entry.title}
                                                            </strong>
                                                            <span>
                                                                {entry.entryType}
                                                                {" · "}
                                                                {entry.status}
                                                            </span>
                                                            <time>
                                                                {formatDateTime(
                                                                    entry.startAt
                                                                )}
                                                                {" – "}
                                                                {formatDateTime(
                                                                    entry.endAt
                                                                )}
                                                            </time>
                                                        </article>
                                                    ))}
                                                </div>
                                            </details>
                                        )}

                    </div>
                </div>
            )}

            {showSchedule && selectedResource && (
                <div
                    className="trade-schedule-modal"
                    role="presentation"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            setShowSchedule(false);
                        }
                    }}
                >
                    <div
                        className="trade-schedule-modal__dialog"
                        ref={scheduleDialogDrag.dialogRef}
                        style={scheduleDialogDrag.dialogStyle}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trade-schedule-title"
                    >
                        <div
                            className="trade-schedule-modal__header trade-dialog-drag-handle"
                            onMouseDown={scheduleDialogDrag.onHeaderMouseDown}
                            title="Drag to move window"
                        >
                            <div>
                                <span>
                                    {selectedResource.resourceNumber}
                                </span>
                                <h3 id="trade-schedule-title">
                                    Schedule {fullName(selectedResource)}
                                </h3>
                                <p>
                                    Select a time slot. Ruby checks the
                                    tradesperson's existing calendar before
                                    creating the booking.
                                </p>
                            </div>

                            <button
                                type="button"
                                aria-label="Close schedule"
                                onClick={() => setShowSchedule(false)}
                            >
                                ×
                            </button>
                        </div>

                        {scheduleError && (
                            <div className="trade-schedule-message is-error">
                                {scheduleError}
                            </div>
                        )}

                        <div className="trade-schedule-grid">
                            <label>
                                Date
                                <input
                                    type="date"
                                    value={scheduleForm.date}
                                    onChange={event => {
                                        setAvailability(undefined);
                                        setScheduleForm(current => ({
                                            ...current,
                                            date: event.target.value
                                        }));
                                    }}
                                />
                            </label>

                            <label>
                                Start
                                <input
                                    type="time"
                                    step={1800}
                                    value={scheduleForm.startTime}
                                    onChange={event => {
                                        setAvailability(undefined);
                                        setScheduleForm(current => ({
                                            ...current,
                                            startTime: event.target.value
                                        }));
                                    }}
                                />
                            </label>

                            <label>
                                End
                                <input
                                    type="time"
                                    step={1800}
                                    value={scheduleForm.endTime}
                                    onChange={event => {
                                        setAvailability(undefined);
                                        setScheduleForm(current => ({
                                            ...current,
                                            endTime: event.target.value
                                        }));
                                    }}
                                />
                            </label>

                            <label>
                                Type
                                <select
                                    value={scheduleForm.entryType}
                                    onChange={event =>
                                        setScheduleForm(current => ({
                                            ...current,
                                            entryType:
                                                event.target.value as CalendarEntryType
                                        }))
                                    }
                                >
                                    <option value="MAINTENANCE">
                                        Maintenance
                                    </option>
                                    <option value="WORK_ORDER">
                                        Work Order
                                    </option>
                                    <option value="INSPECTION">
                                        Inspection
                                    </option>
                                    <option value="UNAVAILABLE">
                                        Unavailable
                                    </option>
                                    <option value="OTHER">
                                        Other
                                    </option>
                                </select>
                            </label>

                            <label>
                                Status
                                <select
                                    value={scheduleForm.status}
                                    onChange={event =>
                                        setScheduleForm(current => ({
                                            ...current,
                                            status:
                                                event.target.value as CalendarEntryStatus
                                        }))
                                    }
                                >
                                    <option value="CONFIRMED">
                                        Confirmed
                                    </option>
                                    <option value="TENTATIVE">
                                        Tentative
                                    </option>
                                </select>
                            </label>

                            <label className="trade-schedule-grid__wide">
                                Title
                                <input
                                    value={scheduleForm.title}
                                    onChange={event =>
                                        setScheduleForm(current => ({
                                            ...current,
                                            title: event.target.value
                                        }))
                                    }
                                    placeholder="e.g. AHU preventive maintenance"
                                />
                            </label>

                            <label className="trade-schedule-grid__wide">
                                Notes
                                <textarea
                                    value={scheduleForm.notes}
                                    onChange={event =>
                                        setScheduleForm(current => ({
                                            ...current,
                                            notes: event.target.value
                                        }))
                                    }
                                    rows={3}
                                    placeholder="Optional booking notes"
                                />
                            </label>
                        </div>

                        <div className="trade-schedule-availability">
                            <button
                                type="button"
                                onClick={() => void checkScheduleAvailability()}
                            >
                                Check Availability
                            </button>

                            {availability && (
                                <strong
                                    className={
                                        availability.available
                                            ? "is-available"
                                            : "is-conflict"
                                    }
                                >
                                    {availability.available
                                        ? "Available"
                                        : `Conflict — ${availability.conflicts.length} booking${availability.conflicts.length === 1 ? "" : "s"}`}
                                </strong>
                            )}
                        </div>

                        {availability &&
                            !availability.available &&
                            availability.conflicts.length > 0 && (
                            <div className="trade-schedule-conflicts">
                                {availability.conflicts.map(conflict => (
                                    <article key={conflict.id}>
                                        <strong>
                                            {conflict.title}
                                        </strong>
                                        <span>
                                            {formatDateTime(conflict.startAt)}
                                            {" – "}
                                            {formatDateTime(conflict.endAt)}
                                        </span>
                                    </article>
                                ))}
                            </div>
                        )}

                        <div className="trade-schedule-modal__actions">
                            <button
                                type="button"
                                onClick={() => setShowSchedule(false)}
                                disabled={scheduleSaving}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="is-primary"
                                onClick={() => void createScheduleEntry()}
                                disabled={scheduleSaving}
                            >
                                {scheduleSaving
                                    ? "Saving..."
                                    : "Create Booking"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .trade-week-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin: 12px 0;
                }

                .trade-week-toolbar > div {
                    display: flex;
                    gap: 8px;
                }

                .trade-week-jump {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                }

                .trade-week-jump label {
                    display: grid;
                    gap: 3px;
                    font-size: 11px;
                    font-weight: 800;
                }

                .trade-week-jump input {
                    min-width: 145px;
                    border: 1px solid rgba(100, 116, 139, .35);
                    border-radius: 8px;
                    padding: 6px 8px;
                    font: inherit;
                }

                .trade-week-toolbar button {
                    border: 1px solid rgba(100, 116, 139, .35);
                    border-radius: 8px;
                    padding: 7px 10px;
                    cursor: pointer;
                    font-weight: 700;
                }

                .trade-week-scroll {
                    overflow-x: auto;
                    border: 1px solid rgba(100, 116, 139, .22);
                    border-radius: 10px;
                }

                .trade-week-grid {
                    min-width: 980px;
                    display: grid;
                    grid-template-columns: 76px repeat(7, minmax(125px, 1fr));
                }

                .trade-week-corner,
                .trade-week-day,
                .trade-week-time {
                    padding: 8px;
                    font-weight: 800;
                    border-right: 1px solid rgba(100, 116, 139, .18);
                    border-bottom: 1px solid rgba(100, 116, 139, .18);
                }

                .trade-week-day {
                    text-align: center;
                }

                .trade-week-time {
                    min-height: 56px;
                    font-size: 12px;
                    text-align: right;
                }

                .trade-week-slot {
                    min-height: 72px;
                    border: 0;
                    border-right: 1px solid rgba(100, 116, 139, .18);
                    border-bottom: 1px solid rgba(100, 116, 139, .18);
                    background: transparent;
                    padding: 4px;
                    cursor: pointer;
                    text-align: left;
                }

                .trade-week-slot:hover {
                    background: rgba(37, 99, 235, .06);
                }

                .trade-week-slot.is-booked {
                    cursor: default;
                    background: rgba(37, 99, 235, .08);
                }

                .trade-week-booking {
                    display: grid;
                    gap: 2px;
                    padding: 5px 6px;
                    margin-bottom: 3px;
                    border: 1px solid rgba(37, 99, 235, .28);
                    border-radius: 6px;
                    overflow: hidden;
                }

                .trade-week-booking strong,
                .trade-week-booking small {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .trade-calendar-list {
                    margin-top: 12px;
                }

                .trade-calendar-list summary {
                    cursor: pointer;
                    font-weight: 800;
                }

                .trade-schedule-heading {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .trade-schedule-add {
                    border: 1px solid rgba(37, 99, 235, .45);
                    border-radius: 8px;
                    padding: 7px 11px;
                    font-weight: 700;
                    cursor: pointer;
                }

                .trade-schedule-summary {
                    margin: 4px 0 0;
                    font-size: 12px;
                }

                .trade-dialog-drag-handle {
                    cursor: grab;
                    user-select: none;
                }

                .trade-dialog-drag-handle:active {
                    cursor: grabbing;
                }

                .trade-dialog-drag-handle button,
                .trade-dialog-drag-handle input,
                .trade-dialog-drag-handle select,
                .trade-dialog-drag-handle textarea,
                .trade-dialog-drag-handle a {
                    cursor: auto;
                    user-select: auto;
                }

                .trade-full-schedule-modal {
                    position: fixed;
                    inset: 0;
                    z-index: 1150;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    background: rgba(15, 23, 42, .62);
                }

                .trade-full-schedule-modal__dialog {
                    width: min(1480px, calc(100vw - 48px));
                    height: min(900px, calc(100vh - 48px));
                    overflow: auto;
                    border-radius: 16px;
                    background: var(--surface, #fff);
                    box-shadow: 0 24px 70px rgba(15, 23, 42, .35);
                    padding: 22px;
                }

                .trade-full-schedule-modal__header {
                    position: sticky;
                    top: -22px;
                    z-index: 10;
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 18px;
                    margin: -22px -22px 18px;
                    padding: 20px 22px 16px;
                    background: var(--surface, #fff);
                    border-bottom: 1px solid rgba(100, 116, 139, .22);
                }

                .trade-full-schedule-modal__header h3,
                .trade-full-schedule-modal__header p {
                    margin: 4px 0 0;
                }

                .trade-full-schedule-modal__header-actions {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .trade-full-schedule-close {
                    border: 0;
                    background: transparent;
                    font-size: 28px;
                    line-height: 1;
                    cursor: pointer;
                }

                .trade-full-schedule-modal .trade-week-toolbar {
                    position: sticky;
                    top: 72px;
                    z-index: 9;
                    padding: 10px 0;
                    background: var(--surface, #fff);
                }

                .trade-full-schedule-modal .trade-week-scroll {
                    width: 100%;
                }

                .trade-full-schedule-modal .trade-week-grid {
                    min-width: 1120px;
                }

                .trade-schedule-modal {
                    position: fixed;
                    inset: 0;
                    z-index: 1200;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    background: rgba(15, 23, 42, .55);
                }

                .trade-schedule-modal__dialog {
                    width: min(760px, calc(100vw - 48px));
                    max-height: calc(100vh - 48px);
                    overflow-y: auto;
                    border-radius: 16px;
                    background: var(--surface, #fff);
                    box-shadow: 0 24px 70px rgba(15, 23, 42, .32);
                    padding: 22px;
                }

                .trade-schedule-modal__header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 18px;
                    margin-bottom: 18px;
                }

                .trade-schedule-modal__header h3,
                .trade-schedule-modal__header p {
                    margin: 4px 0 0;
                }

                .trade-schedule-modal__header > button {
                    border: 0;
                    background: transparent;
                    font-size: 28px;
                    cursor: pointer;
                }

                .trade-schedule-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 14px;
                }

                .trade-schedule-grid label {
                    display: grid;
                    gap: 6px;
                    font-weight: 700;
                }

                .trade-schedule-grid input,
                .trade-schedule-grid select,
                .trade-schedule-grid textarea {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 10px 11px;
                    border: 1px solid rgba(100, 116, 139, .45);
                    border-radius: 8px;
                    font: inherit;
                }

                .trade-schedule-grid__wide {
                    grid-column: 1 / -1;
                }

                .trade-schedule-availability {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    margin-top: 18px;
                }

                .trade-schedule-availability button,
                .trade-schedule-modal__actions button {
                    border: 1px solid rgba(100, 116, 139, .45);
                    border-radius: 8px;
                    padding: 9px 14px;
                    font-weight: 700;
                    cursor: pointer;
                }

                .trade-schedule-availability .is-available {
                    color: #15803d;
                }

                .trade-schedule-availability .is-conflict,
                .trade-schedule-message.is-error {
                    color: #b91c1c;
                }

                .trade-schedule-message {
                    margin-bottom: 14px;
                    padding: 10px 12px;
                    border-radius: 8px;
                    background: rgba(239, 68, 68, .08);
                    font-weight: 700;
                }

                .trade-schedule-conflicts {
                    display: grid;
                    gap: 8px;
                    margin-top: 14px;
                }

                .trade-schedule-conflicts article {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 10px 12px;
                    border: 1px solid rgba(239, 68, 68, .25);
                    border-radius: 8px;
                }

                .trade-schedule-modal__actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 22px;
                }

                .trade-schedule-modal__actions .is-primary {
                    border-color: transparent;
                    background: #2563eb;
                    color: #fff;
                }

                @media (max-width: 720px) {
                    .trade-schedule-grid {
                        grid-template-columns: 1fr;
                    }

                    .trade-schedule-grid__wide {
                        grid-column: auto;
                    }
                }

                .trade-resource-modal__dialog {
                    max-height: calc(100vh - 48px);
                    overflow-y: auto;
                    position: relative;
                    transform: translate(var(--trade-modal-x, 0px), var(--trade-modal-y, 0px));
                }

                .trade-resource-modal__header {
                    position: sticky;
                    top: 0;
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 18px;
                    background: #ffffff;
                    border-bottom: 1px solid #cbd5e1;
                    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
                    cursor: move;
                    user-select: none;
                    touch-action: none;
                }

                .trade-resource-modal__header button {
                    cursor: pointer;
                }

                .trade-resource-modal__error {
                    margin: 12px 14px 0;
                    padding: 10px 12px;
                    border: 1px solid #dc2626;
                    border-radius: 6px;
                    background: #fef2f2;
                    color: #991b1b;
                    font-weight: 600;
                }

                .trade-resource-form__primary-skill {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    margin-left: 8px;
                    padding: 2px 6px;
                    border: 1px solid #94a3b8;
                    border-radius: 4px;
                    background: #f8fafc;
                    font-size: 0.78rem;
                    font-weight: 600;
                }
            `}</style>

            {showAddResource && (

                <div

                    className="trade-resource-modal"

                    role="presentation"

                >

                    <div

                        className="trade-resource-modal__dialog"

                        role="dialog"

                        aria-modal="true"

                        aria-labelledby="add-tradesperson-title"
                        style={{
                            transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`
                        }}

                    >

                        <header
                            className="trade-resource-modal__header"
                            onPointerDown={event => {
                                if (event.button !== 0) {
                                    return;
                                }

                                event.currentTarget.setPointerCapture(
                                    event.pointerId
                                );

                                setDragOrigin({
                                    pointerId: event.pointerId,
                                    clientX: event.clientX,
                                    clientY: event.clientY,
                                    startX: modalPosition.x,
                                    startY: modalPosition.y
                                });
                            }}
                            onPointerMove={event => {
                                if (
                                    !dragOrigin ||
                                    dragOrigin.pointerId !== event.pointerId
                                ) {
                                    return;
                                }

                                setModalPosition({
                                    x:
                                        dragOrigin.startX +
                                        event.clientX -
                                        dragOrigin.clientX,
                                    y:
                                        dragOrigin.startY +
                                        event.clientY -
                                        dragOrigin.clientY
                                });
                            }}
                            onPointerUp={event => {
                                if (dragOrigin?.pointerId === event.pointerId) {
                                    setDragOrigin(undefined);
                                }
                            }}
                            onPointerCancel={() =>
                                setDragOrigin(undefined)
                            }
                        >

                            <div>

                                <span>

                                    Workforce Resource

                                </span>



                                <h3 id="add-tradesperson-title">

                                    Add Tradesperson

                                </h3>

                            </div>



                            <button

                                type="button"

                                aria-label="Close"
                                onPointerDown={event =>
                                    event.stopPropagation()
                                }
                                onClick={() => {
                                    setModalError(undefined);
                                    setShowAddResource(false);
                                }}

                            >

                                ×

                            </button>

                        </header>



                        {modalError && (
                            <div
                                className="trade-resource-modal__error"
                                role="alert"
                            >
                                {modalError}
                            </div>
                        )}

                        <div className="trade-resource-form">

                            <label>

                                First Name *

                                <input

                                    value={

                                        form.firstName

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "firstName",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>

                                Last Name *

                                <input

                                    value={

                                        form.lastName

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "lastName",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>
                                Primary Trade *
                                <select
                                    value={form.trade}
                                    onChange={event =>
                                        updateForm(
                                            "trade",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {form.skillIds.length === 0
                                            ? "Select trades/skills first..."
                                            : "Select primary trade..."}
                                    </option>

                                    {skills
                                        .filter(skill =>
                                            form.skillIds.includes(
                                                skill.id
                                            )
                                        )
                                        .map(skill => (
                                            <option
                                                key={skill.id}
                                                value={skill.name}
                                            >
                                                {skill.name}
                                            </option>
                                        ))}
                                </select>

                                {form.skillIds.length === 0 && (
                                    <small>
                                        Select one or more skills below,
                                        then choose the primary trade.
                                    </small>
                                )}
                            </label>



                            <label>

                                Resource Type

                                <select

                                    value={

                                        form.resourceType

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "resourceType",

                                            event.target.value as TradeResourceType

                                        )

                                    }

                                >

                                    <option value="EMPLOYEE">

                                        Employee

                                    </option>

                                    <option value="CONTRACTOR">

                                        Contractor

                                    </option>

                                    <option value="VENDOR">

                                        Vendor

                                    </option>

                                </select>

                            </label>



                            <label>

                                Employer / Company

                                <input

                                    value={

                                        form.employerName

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "employerName",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>

                                Email

                                <input

                                    type="email"

                                    value={

                                        form.email

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "email",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>

                                Phone

                                <input

                                    value={

                                        form.phone

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "phone",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>

                                Country *

                                <select
                                    value={
                                        form.countryCode
                                    }
                                    onChange={event => {
                                        const countryCode =
                                            event.target.value;

                                        const country =
                                            regionalConfiguration?.countries.find(
                                                item =>
                                                    item.code === countryCode
                                            );

                                        setModalError(undefined);
                                        setForm(
                                            current => ({
                                                ...current,
                                                countryCode,
                                                administrativeRegionCode: "",
                                                serviceAreaId: "",
                                                serviceRegion: "",
                                                currency:
                                                    country?.defaultCurrencyCode ??
                                                    current.currency
                                            })
                                        );
                                    }}
                                    required
                                >
                                    <option value="">
                                        Select country
                                    </option>

                                    {regionalConfiguration?.countries.map(
                                        country => (
                                            <option
                                                key={country.code}
                                                value={country.code}
                                            >
                                                {country.name} ({country.code})
                                            </option>
                                        )
                                    )}
                                </select>

                            </label>



                            <label>

                                Region / State / Province

                                <select
                                    value={form.administrativeRegionCode}
                                    onChange={event => {
                                        const administrativeRegionCode =
                                            event.target.value;

                                        setModalError(undefined);
                                        setForm(current => ({
                                            ...current,
                                            administrativeRegionCode,
                                            serviceAreaId: "",
                                            serviceRegion: ""
                                        }));
                                    }}
                                    disabled={!form.countryCode}
                                >
                                    <option value="">
                                        {form.countryCode
                                            ? "Select region"
                                            : "Select country first"}
                                    </option>

                                    {regionalConfiguration?.administrativeRegions
                                        .filter(region =>
                                            region.countryCode === form.countryCode
                                        )
                                        .map(region => (
                                            <option
                                                key={`${region.countryCode}-${region.code}`}
                                                value={region.code}
                                            >
                                                {region.name}
                                                {region.regionType
                                                    ? ` — ${region.regionType}`
                                                    : ""}
                                            </option>
                                        ))}
                                </select>

                            </label>



                            <label>

                                Service Area

                                <select
                                    value={form.serviceAreaId}
                                    onChange={event => {
                                        const serviceAreaId =
                                            event.target.value;

                                        const serviceArea =
                                            regionalConfiguration?.serviceAreas.find(
                                                item => item.id === serviceAreaId
                                            );

                                        setModalError(undefined);
                                        setForm(current => ({
                                            ...current,
                                            serviceAreaId,
                                            serviceRegion:
                                                serviceArea?.name ?? ""
                                        }));
                                    }}
                                    disabled={!form.administrativeRegionCode}
                                >
                                    <option value="">
                                        {form.administrativeRegionCode
                                            ? "Select service area"
                                            : "Select region first"}
                                    </option>

                                    {regionalConfiguration?.serviceAreas
                                        .filter(area =>
                                            area.countryCode === form.countryCode &&
                                            area.regionCode === form.administrativeRegionCode
                                        )
                                        .map(area => (
                                            <option
                                                key={area.id}
                                                value={area.id}
                                            >
                                                {area.name}
                                            </option>
                                        ))}
                                </select>

                            </label>



                            <label>

                                Hourly Rate

                                <input

                                    type="number"

                                    min="0"

                                    step="0.01"

                                    value={

                                        form.hourlyRate

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "hourlyRate",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <label>

                                Currency *

                                <select
                                    value={
                                        form.currency
                                    }
                                    onChange={event =>
                                        updateForm(
                                            "currency",
                                            event.target.value
                                        )
                                    }
                                    required
                                >
                                    <option value="">
                                        Select currency
                                    </option>

                                    {regionalConfiguration?.currencies.map(
                                        currency => (
                                            <option
                                                key={currency.code}
                                                value={currency.code}
                                            >
                                                {currency.code} — {currency.name}
                                            </option>
                                        )
                                    )}
                                </select>

                            </label>



                            <label>

                                Status

                                <select

                                    value={

                                        form.status

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "status",

                                            event.target.value as TradeResourceStatus

                                        )

                                    }

                                >

                                    <option value="ACTIVE">

                                        Active

                                    </option>

                                    <option value="INACTIVE">

                                        Inactive

                                    </option>

                                </select>

                            </label>



                            <label className="trade-resource-form__wide">

                                Notes

                                <textarea

                                    rows={

                                        3

                                    }

                                    value={

                                        form.notes

                                    }

                                    onChange={event =>

                                        updateForm(

                                            "notes",

                                            event.target.value

                                        )

                                    }

                                />

                            </label>



                            <fieldset className="trade-resource-form__skills">

                                <legend>

                                    Skills &amp;

                                    Qualifications

                                </legend>



                                <p>

                                    Select the skills

                                    this resource is

                                    qualified to perform.

                                </p>



                                <div>

                                    {skills.map(

                                        skill => (

                                            <label

                                                key={

                                                    skill.id

                                                }

                                            >

                                                <input

                                                    type="checkbox"

                                                    checked={form.skillIds.includes(

                                                        skill.id

                                                    )}

                                                    onChange={() => {
                                                            const isSelected =
                                                                form.skillIds.includes(
                                                                    skill.id
                                                                );

                                                            toggleSkill(
                                                                skill.id
                                                            );

                                                            if (
                                                                isSelected &&
                                                                form.trade === skill.name
                                                            ) {
                                                                updateForm(
                                                                    "trade",
                                                                    ""
                                                                );
                                                            }
                                                        }}

                                                />



                                                <span>

                                                    <strong>

                                                        {

                                                            skill.name

                                                        }

                                                    </strong>

                                                        {form.skillIds.includes(
                                                            skill.id
                                                        ) && (
                                                            <label className="trade-resource-form__primary-skill">
                                                                <input
                                                                    type="radio"
                                                                    name="primaryTrade"
                                                                    checked={
                                                                        form.trade ===
                                                                        skill.name
                                                                    }
                                                                    onChange={() =>
                                                                        updateForm(
                                                                            "trade",
                                                                            skill.name
                                                                        )
                                                                    }
                                                                />
                                                                Primary
                                                            </label>
                                                        )}



                                                    <small>

                                                        {

                                                            skill.code

                                                        }

                                                    </small>

                                                </span>

                                            </label>

                                        )

                                    )}

                                </div>

                            </fieldset>

                        </div>



                        <footer>

                            <button

                                type="button"

                                onClick={() => {
                                    setModalError(undefined);
                                    setShowAddResource(false);
                                }}

                                disabled={

                                    saving

                                }

                            >

                                Cancel

                            </button>



                            <button

                                className="trade-resources__primary"

                                type="button"

                                disabled={

                                    saving

                                }

                                onClick={() =>

                                    void createResource()

                                }

                            >

                                {saving

                                    ? "Creating..."

                                    : "Create Tradesperson"}

                            </button>

                        </footer>

                    </div>

                </div>

            )}

        </section>

    );

}