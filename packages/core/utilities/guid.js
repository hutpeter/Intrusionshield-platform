const crypto =
require("crypto");


module.exports = {


    create(){

        return crypto
            .randomUUID();

    }


};