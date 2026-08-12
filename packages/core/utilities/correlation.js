const crypto =
require("crypto");


module.exports = {


    generate(){

        return crypto
            .randomUUID();

    }


};