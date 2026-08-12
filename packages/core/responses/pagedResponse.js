class PagedResponse {

    constructor(
        items,
        total,
        page,
        pageSize
    ){

        this.items = items;

        this.total = total;

        this.page = page;

        this.pageSize = pageSize;

        this.totalPages =
            Math.ceil(
                total / pageSize
            );

    }

}


module.exports = PagedResponse;