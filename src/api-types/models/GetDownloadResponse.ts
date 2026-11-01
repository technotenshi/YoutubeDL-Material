/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Download } from './Download';

export type GetDownloadResponse = {
    /**
     * The full download. Null if there is no download with this UID that belongs to the requesting user.
     */
    download?: Download | null;
};
