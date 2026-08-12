class TenantContext {


    constructor(data={}){


        this.tenantId =
            data.tenantId;


        this.companyId =
            data.companyId;


        this.businessUnitId =
            data.businessUnitId;


        this.environment =
            data.environment;


        this.features =
            data.features || [];

    }


}


module.exports = TenantContext;