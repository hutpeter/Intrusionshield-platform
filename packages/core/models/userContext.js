class UserContext {


    constructor(data={}){


        this.userId =
            data.userId;


        this.username =
            data.username;


        this.roles =
            data.roles || [];


        this.permissions =
            data.permissions || [];

    }


}


module.exports = UserContext;