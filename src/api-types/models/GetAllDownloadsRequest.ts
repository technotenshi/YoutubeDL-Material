/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type GetAllDownloadsRequest = {
    /**
     * Only these downloads are read. Omit or null for all of the user's downloads; an empty array returns none.
     */
    uids?: Array<string> | null;
};
