const AppError =
require("./appError");


class ConflictError extends AppError {


    constructor(message){

        super(
            message,
            409,
            "CONFLICT"
        );

    }

}


module.exports = ConflictError;