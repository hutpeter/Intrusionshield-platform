const AppError =
require("./appError");


class NotFoundError extends AppError {


    constructor(message){

        super(
            message,
            404,
            "NOT_FOUND"
        );

    }

}


module.exports = NotFoundError;