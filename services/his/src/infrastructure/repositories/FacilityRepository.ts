import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Facility } from "@intrusionshield/his";

export interface FacilityRepository {
  findById(id: string, tenantId: string): Promise<Facility | null>;
  create(facility: Facility): Promise<Facility>;
  update(facility: Facility): Promise<Facility>;
}

export class SqlFacilityRepository implements FacilityRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

  public async findById(id: string, tenantId: string): Promise<Facility | null> {
    const result = await this.database.query<FacilityRow>(
      `SELECT id, tenant_id AS tenantId, parent_facility_id AS parentFacilityId,
              facility_type AS facilityType, code, name, description,
              address_line1 AS addressLine1, address_line2 AS addressLine2,
              address_city AS addressCity, address_province_or_state AS addressProvinceOrState,
              address_postal_code AS addressPostalCode, address_country AS addressCountry,
              contact_email AS contactEmail, contact_phone AS contactPhone,
              contact_mobile_phone AS contactMobilePhone, status,
              created_at AS createdAt, updated_at AS updatedAt, version
       FROM HIS.Facilities
       WHERE id = @id AND tenant_id = @tenantId`,
      [{ name: "id", value: id }, { name: "tenantId", value: tenantId }]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      parentFacilityId: row.parentFacilityId ?? undefined,
      facilityType: row.facilityType,
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      address: row.addressLine1
        ? {
            line1: row.addressLine1,
            line2: row.addressLine2 ?? undefined,
            city: row.addressCity ?? "",
            provinceOrState: row.addressProvinceOrState ?? undefined,
            postalCode: row.addressPostalCode ?? undefined,
            country: row.addressCountry ?? ""
          }
        : undefined,
      contactInformation:
        row.contactEmail || row.contactPhone || row.contactMobilePhone
          ? { email: row.contactEmail ?? undefined, phone: row.contactPhone ?? undefined, mobilePhone: row.contactMobilePhone ?? undefined }
          : undefined,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }

  public async create(facility: Facility): Promise<Facility> {
    await this.database.execute(
      `INSERT INTO HIS.Facilities
       (id, tenant_id, parent_facility_id, facility_type, code, name, description,
        address_line1, address_line2, address_city, address_province_or_state,
        address_postal_code, address_country, contact_email, contact_phone,
        contact_mobile_phone, status, created_at, updated_at, version)
       VALUES (@id, @tenantId, @parentFacilityId, @facilityType, @code, @name, @description,
               @addressLine1, @addressLine2, @addressCity, @addressProvinceOrState,
               @addressPostalCode, @addressCountry, @contactEmail, @contactPhone,
               @contactMobilePhone, @status, @createdAt, @updatedAt, @version)`,
      this.parameters(facility)
    );
    return facility;
  }

  public async update(facility: Facility): Promise<Facility> {
    const nextVersion = facility.version + 1;
    const rows = await this.database.execute(
      `UPDATE HIS.Facilities
       SET parent_facility_id = @parentFacilityId, facility_type = @facilityType,
           code = @code, name = @name, description = @description,
           address_line1 = @addressLine1, address_line2 = @addressLine2,
           address_city = @addressCity, address_province_or_state = @addressProvinceOrState,
           address_postal_code = @addressPostalCode, address_country = @addressCountry,
           contact_email = @contactEmail, contact_phone = @contactPhone,
           contact_mobile_phone = @contactMobilePhone, status = @status,
           updated_at = @updatedAt, version = @nextVersion
       WHERE id = @id AND tenant_id = @tenantId AND version = @version`,
      [...this.parameters(facility), { name: "nextVersion", value: nextVersion }]
    );
    if (rows !== 1) throw new Error("Facility was modified or does not exist");
    return { ...facility, version: nextVersion };
  }

  private parameters(facility: Facility) {
    return [
      { name: "id", value: facility.id }, { name: "tenantId", value: facility.tenantId },
      { name: "parentFacilityId", value: facility.parentFacilityId ?? null }, { name: "facilityType", value: facility.facilityType },
      { name: "code", value: facility.code }, { name: "name", value: facility.name }, { name: "description", value: facility.description ?? null },
      { name: "addressLine1", value: facility.address?.line1 ?? null }, { name: "addressLine2", value: facility.address?.line2 ?? null },
      { name: "addressCity", value: facility.address?.city ?? null }, { name: "addressProvinceOrState", value: facility.address?.provinceOrState ?? null },
      { name: "addressPostalCode", value: facility.address?.postalCode ?? null }, { name: "addressCountry", value: facility.address?.country ?? null },
      { name: "contactEmail", value: facility.contactInformation?.email ?? null }, { name: "contactPhone", value: facility.contactInformation?.phone ?? null },
      { name: "contactMobilePhone", value: facility.contactInformation?.mobilePhone ?? null }, { name: "status", value: facility.status },
      { name: "createdAt", value: facility.createdAt }, { name: "updatedAt", value: facility.updatedAt }, { name: "version", value: facility.version }
    ];
  }
}

interface FacilityRow {
  id: string; tenantId: string; parentFacilityId?: string; facilityType: Facility["facilityType"];
  code: string; name: string; description?: string; addressLine1?: string; addressLine2?: string;
  addressCity?: string; addressProvinceOrState?: string; addressPostalCode?: string; addressCountry?: string;
  contactEmail?: string; contactPhone?: string; contactMobilePhone?: string; status: Facility["status"];
  createdAt: Date; updatedAt: Date; version: number;
}
