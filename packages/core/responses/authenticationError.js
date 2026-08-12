const AppError =
require("./appError");


class AuthenticationError extends AppError {


    constructor(message){

        super(
            message,
            401,
            "AUTHENTICATION_ERROR"
        );

    }

}


module.exports = AuthenticationError;