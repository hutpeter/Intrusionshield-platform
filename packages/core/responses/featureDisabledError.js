const AppError =
require("./appError");


class FeatureDisabledError extends AppError {


    constructor(message){

        super(
            message,
            403,
            "FEATURE_DISABLED"
        );

    }

}


module.exports = FeatureDisabledError;