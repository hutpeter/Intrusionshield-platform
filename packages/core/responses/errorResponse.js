class ErrorResponse {

    constructor(
        message,
        code = null,
        details = null
    ){

        this.success = false;

        this.message = message;

        this.code = code;

        this.details = details;

    }

}


module.exports = ErrorResponse;