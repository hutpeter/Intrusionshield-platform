import { randomUUID } from "node:crypto";
import { normalizeUuid, type IDatabaseProvider } from "@intrusionshield/database";

export type EnergyContractStatus = "DRAFT" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "TERMINATED";
export type MaintenanceStatus = "UPCOMING" | "DUE" | "OVERDUE" | "COMPLETED";

export interface EnergyContract {
    readonly id: string; readonly tenantId: string; readonly contractNumber: string; readonly name: string;
    readonly vendorName: string; readonly contractType: string; readonly siteId?: string; readonly owner?: string;
    readonly startDate: Date; readonly endDate: Date; readonly renewalDate?: Date; readonly noticeDate?: Date;
    readonly valueAmount?: number; readonly currency?: string; readonly rateDescription?: string;
    readonly status: EnergyContractStatus; readonly description?: string; readonly notes?: string;
    readonly createdAt: Date; readonly updatedAt: Date; readonly version: number;
}
export interface MaintenanceActivity {
    readonly id: string; readonly tenantId: string; readonly contractId: string; readonly assetId?: string;
    readonly activity: string; readonly frequency?: string; readonly nextDueDate?: Date; readonly responsibleParty?: string;
    readonly sla?: string; readonly status: MaintenanceStatus; readonly lastCompletedAt?: Date; readonly notes?: string;
    readonly createdAt: Date; readonly updatedAt: Date; readonly version: number;
}
export interface CreateEnergyContractInput extends Omit<EnergyContract, "id"|"createdAt"|"updatedAt"|"version"> {}
export interface CreateMaintenanceActivityInput extends Omit<MaintenanceActivity, "id"|"createdAt"|"updatedAt"|"version"> {}
export interface ContractCoverage {
    readonly id: string; readonly tenantId: string; readonly contractId: string; readonly siteId?: string; readonly assetId?: string;
    readonly assetCode?: string; readonly assetName?: string; readonly assetType?: string; readonly assetStatus?: string; readonly createdAt: Date;
}
export interface CreateContractCoverageInput { readonly tenantId: string; readonly contractId: string; readonly siteId?: string; readonly assetId?: string; }

export class SqlEnergyContractRepository {
    public constructor(private readonly database: IDatabaseProvider) {}

    public async create(input: CreateEnergyContractInput): Promise<EnergyContract> {
        const now = new Date();
        const contract: EnergyContract = { ...input, id: randomUUID(), createdAt: now, updatedAt: now, version: 1 };
        await this.database.execute(`INSERT INTO Energy.Contracts
            (id,tenant_id,contract_number,name,vendor_name,contract_type,site_id,owner,start_date,end_date,renewal_date,notice_date,value_amount,currency,rate_description,status,description,notes,created_at,updated_at,version)
            VALUES (@id,@tenantId,@contractNumber,@name,@vendorName,@contractType,@siteId,@owner,@startDate,@endDate,@renewalDate,@noticeDate,@valueAmount,@currency,@rateDescription,@status,@description,@notes,@createdAt,@updatedAt,@version)`, params(contract));
        return contract;
    }

    public async findAll(tenantId: string): Promise<readonly EnergyContract[]> {
        const r = await this.database.query<ContractRow>(`SELECT id,tenant_id tenantId,contract_number contractNumber,name,vendor_name vendorName,contract_type contractType,site_id siteId,owner,start_date startDate,end_date endDate,renewal_date renewalDate,notice_date noticeDate,value_amount valueAmount,currency,rate_description rateDescription,status,description,notes,created_at createdAt,updated_at updatedAt,version FROM Energy.Contracts WHERE tenant_id=@tenantId ORDER BY end_date,name`, [{name:"tenantId",value:tenantId}]);
        return r.rows.map(mapContract);
    }

    public async findById(id: string, tenantId: string): Promise<EnergyContract|null> {
        const r = await this.database.query<ContractRow>(`SELECT id,tenant_id tenantId,contract_number contractNumber,name,vendor_name vendorName,contract_type contractType,site_id siteId,owner,start_date startDate,end_date endDate,renewal_date renewalDate,notice_date noticeDate,value_amount valueAmount,currency,rate_description rateDescription,status,description,notes,created_at createdAt,updated_at updatedAt,version FROM Energy.Contracts WHERE id=@id AND tenant_id=@tenantId`, [{name:"id",value:id},{name:"tenantId",value:tenantId}]);
        return r.rows[0] ? mapContract(r.rows[0]) : null;
    }

    public async addCoverage(input: CreateContractCoverageInput): Promise<ContractCoverage> {
        if (!input.siteId && !input.assetId) throw new Error("siteId or assetId is required.");
        if (input.assetId) {
            const existing = await this.database.query<{id:string}>(`SELECT id FROM Energy.ContractCoverage WHERE tenant_id=@tenantId AND contract_id=@contractId AND asset_id=@assetId`, [{name:"tenantId",value:input.tenantId},{name:"contractId",value:input.contractId},{name:"assetId",value:input.assetId}]);
            if (existing.rows[0]) throw new Error("This asset is already covered by the contract.");
        }
        const item = { ...input, id: randomUUID(), createdAt: new Date() };
        await this.database.execute(`INSERT INTO Energy.ContractCoverage (id,tenant_id,contract_id,site_id,asset_id,created_at) VALUES (@id,@tenantId,@contractId,@siteId,@assetId,@createdAt)`, Object.entries(item).map(([name,value])=>({name,value:value??null})));
        const rows = await this.findCoverage(input.contractId,input.tenantId);
        return rows.find(row=>row.id===item.id) ?? item;
    }

    public async findCoverage(contractId:string, tenantId:string): Promise<readonly ContractCoverage[]> {
        const r=await this.database.query<CoverageRow>(`SELECT c.id,c.tenant_id tenantId,c.contract_id contractId,c.site_id siteId,c.asset_id assetId,a.code assetCode,a.name assetName,a.asset_type assetType,a.status assetStatus,c.created_at createdAt FROM Energy.ContractCoverage c LEFT JOIN Telemetry.Assets a ON a.id=c.asset_id AND a.tenant_id=c.tenant_id WHERE c.contract_id=@contractId AND c.tenant_id=@tenantId ORDER BY a.name,a.code,c.created_at`,[{name:"contractId",value:contractId},{name:"tenantId",value:tenantId}]);
        return r.rows.map(mapCoverage);
    }

    public async createMaintenance(input: CreateMaintenanceActivityInput): Promise<MaintenanceActivity> {
        const now = new Date(); const item: MaintenanceActivity = {...input,id:randomUUID(),createdAt:now,updatedAt:now,version:1};
        await this.database.execute(`INSERT INTO Energy.ContractMaintenanceActivities (id,tenant_id,contract_id,asset_id,activity,frequency,next_due_date,responsible_party,sla,status,last_completed_at,notes,created_at,updated_at,version) VALUES (@id,@tenantId,@contractId,@assetId,@activity,@frequency,@nextDueDate,@responsibleParty,@sla,@status,@lastCompletedAt,@notes,@createdAt,@updatedAt,@version)`, maintenanceParams(item));
        return item;
    }

    public async findMaintenance(contractId:string, tenantId:string): Promise<readonly MaintenanceActivity[]> {
        const r=await this.database.query<MaintenanceRow>(`SELECT id,tenant_id tenantId,contract_id contractId,asset_id assetId,activity,frequency,next_due_date nextDueDate,responsible_party responsibleParty,sla,status,last_completed_at lastCompletedAt,notes,created_at createdAt,updated_at updatedAt,version FROM Energy.ContractMaintenanceActivities WHERE contract_id=@contractId AND tenant_id=@tenantId ORDER BY next_due_date,activity`,[{name:"contractId",value:contractId},{name:"tenantId",value:tenantId}]);
        return r.rows.map(mapMaintenance);
    }
}

type ContractRow = EnergyContract & {siteId:string|null;owner:string|null;renewalDate:Date|null;noticeDate:Date|null;valueAmount:number|null;currency:string|null;rateDescription:string|null;description:string|null;notes:string|null};
type CoverageRow = ContractCoverage & {siteId:string|null;assetId:string|null;assetCode:string|null;assetName:string|null;assetType:string|null;assetStatus:string|null};
type MaintenanceRow = MaintenanceActivity & {assetId:string|null;frequency:string|null;nextDueDate:Date|null;responsibleParty:string|null;sla:string|null;lastCompletedAt:Date|null;notes:string|null};
function mapContract(r:ContractRow):EnergyContract{return {...r,id:normalizeUuid(r.id),tenantId:normalizeUuid(r.tenantId),siteId:r.siteId?normalizeUuid(r.siteId):undefined,owner:r.owner??undefined,renewalDate:r.renewalDate??undefined,noticeDate:r.noticeDate??undefined,valueAmount:r.valueAmount??undefined,currency:r.currency??undefined,rateDescription:r.rateDescription??undefined,description:r.description??undefined,notes:r.notes??undefined};}
function mapCoverage(r:CoverageRow):ContractCoverage{return {...r,id:normalizeUuid(r.id),tenantId:normalizeUuid(r.tenantId),contractId:normalizeUuid(r.contractId),siteId:r.siteId?normalizeUuid(r.siteId):undefined,assetId:r.assetId?normalizeUuid(r.assetId):undefined,assetCode:r.assetCode??undefined,assetName:r.assetName??undefined,assetType:r.assetType??undefined,assetStatus:r.assetStatus??undefined};}
function mapMaintenance(r:MaintenanceRow):MaintenanceActivity{return {...r,id:normalizeUuid(r.id),tenantId:normalizeUuid(r.tenantId),contractId:normalizeUuid(r.contractId),assetId:r.assetId?normalizeUuid(r.assetId):undefined,frequency:r.frequency??undefined,nextDueDate:r.nextDueDate??undefined,responsibleParty:r.responsibleParty??undefined,sla:r.sla??undefined,lastCompletedAt:r.lastCompletedAt??undefined,notes:r.notes??undefined};}
function params(c:EnergyContract){return Object.entries(c).map(([name,value])=>({name,value:value??null}));}
function maintenanceParams(c:MaintenanceActivity){return Object.entries(c).map(([name,value])=>({name,value:value??null}));}
