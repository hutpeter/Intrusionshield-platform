class LicenseContext {


    constructor(data={}){


        this.products =
            data.products || [];


        this.features =
            data.features || [];


        this.expiry =
            data.expiry;

    }


}


module.exports = LicenseContext;