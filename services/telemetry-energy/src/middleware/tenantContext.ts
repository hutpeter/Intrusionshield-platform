import type {NextFunction,Request,Response} from "express";
export interface TenantRequest extends Request {tenantId?:string}
export function tenantContext(req:TenantRequest,res:Response,next:NextFunction):void{const id=req.header("x-tenant-id")?.trim();if(!id){res.status(400).json({error:"The x-tenant-id header is required."});return;}req.tenantId=id;next();}
export function requireTenantId(req:TenantRequest):string{if(!req.tenantId)throw new Error("Tenant context is unavailable.");return req.tenantId;}