/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * What the downloads list shows of a download. The error text, prefetched info and options of a download can be very large, so they are only returned by /api/download.
 */
export type DownloadSummary = {
    uid: string;
    running: boolean;
    finished: boolean;
    paused: boolean;
    cancelled?: boolean;
    finished_step: boolean;
    url: string;
    type: string;
    title: string;
    step_index: number;
    /**
     * Null until the download step reports progress, then a string with two decimals (for example "42.50"), and the number 100 once the download has finished. These are the values the server stores.
     */
    percent_complete: (number | string) | null;
    timestamp_start: number;
    /**
     * True if the download has error text. Get the text from /api/download.
     */
    has_error: boolean;
    /**
     * Name of the subscription the download came from. Null for a one-off download.
     */
    sub_name?: string | null;
    /**
     * Set once the download has finished. Only what opening the result in the player needs; a playlist has id and uids, a single file has uid and id.
     */
    container?: {
        uid?: string;
        id?: string;
        uids?: Array<string>;
    };
};
