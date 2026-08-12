const AppError =
require("./appError");


class LicenseError extends AppError {


    constructor(message){

        super(
            message,
            403,
            "LICENSE_ERROR"
        );

    }

}


module.exports = LicenseError;