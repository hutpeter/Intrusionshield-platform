class ApiResponse {

    static success(
        data = null,
        message = "Success"
    ) {

        return {
            success: true,
            message,
            data
        };

    }


    static error(
        message,
        details = null
    ) {

        return {
            success:false,
            message,
            details
        };

    }

}


module.exports = ApiResponse;