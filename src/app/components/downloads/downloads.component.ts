import { Component, OnInit, OnDestroy, ViewChild, Input, EventEmitter, HostListener } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { trigger, transition, animateChild, stagger, query, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from 'app/dialogs/confirm-dialog/confirm-dialog.component';
import { MatSort } from '@angular/material/sort';
import { Clipboard } from '@angular/cdk/clipboard';
import { DownloadSummary, GetAllDownloadsResponse } from 'api-types';
import { Subject, timer, of } from 'rxjs';
import { catchError, exhaustMap, finalize, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-downloads',
  templateUrl: './downloads.component.html',
  styleUrls: ['./downloads.component.scss']
})
export class DownloadsComponent implements OnInit, OnDestroy {

  @Input() uids: string[] = null;

  downloads_check_interval = 1000;
  downloads: DownloadSummary[] = [];
  finished_downloads = [];

  // Set once the recurring check runs, so it starts only once however often it is asked to
  polling = false;
  last_downloads_json: string = null;
  // Downloads whose error text is being loaded for the error dialog
  error_loading_uids = new Set<string>();
  destroyed = new Subject<void>();

  keys = Object.keys;

  valid_sessions_length = 0;

  paused_download_exists = false;
  running_download_exists = false;

  STEP_INDEX_TO_LABEL = {
      0: $localize`Creating download`,
      1: $localize`Getting info`,
      2: $localize`Downloading file`,
      3: $localize`Complete`
  }

  actionsFlex = 2;
  minimizeButtons = false;
  displayedColumnsBig: string[] = ['timestamp_start', 'title', 'sub_name', 'percent_complete', 'actions'];
  displayedColumnsSmall: string[] = ['title', 'percent_complete', 'actions'];
  displayedColumns: string[] = this.displayedColumnsBig;
  dataSource = null; // new MatTableDataSource<Download>();

  // The purpose of this is to reduce code reuse for displaying these actions as icons or in a menu
  downloadActions: DownloadAction[] = [
    {
      tooltip: $localize`Watch content`,
      action: (download: DownloadSummary) => this.watchContent(download),
      show: (download: DownloadSummary) => download.finished && !download.has_error,
      icon: 'smart_display'
    },
    {
      tooltip: $localize`Show error`,
      action: (download: DownloadSummary) => this.showError(download),
      show: (download: DownloadSummary) => download.finished && download.has_error,
      icon: 'warning',
      loading: (download: DownloadSummary) => this.error_loading_uids.has(download.uid)
    },
    {
      tooltip: $localize`Restart`,
      action: (download: DownloadSummary) => this.restartDownload(download),
      show: (download: DownloadSummary) => download.finished,
      icon: 'restart_alt'
    },
    {
      tooltip: $localize`Pause`,
      action: (download: DownloadSummary) => this.pauseDownload(download),
      show: (download: DownloadSummary) => !download.finished && (!download.paused || !download.finished_step),
      icon: 'pause'
    },
    {
      tooltip: $localize`Resume`,
      action: (download: DownloadSummary) => this.resumeDownload(download),
      show: (download: DownloadSummary) => !download.finished && download.paused && download.finished_step,
      icon: 'play_arrow'
    },
    {
      tooltip: $localize`Cancel`,
      action: (download: DownloadSummary) => this.cancelDownload(download),
      show: (download: DownloadSummary) => !download.finished && !download.paused && !download.cancelled,
      icon: 'cancel'
    },
    {
      tooltip: $localize`Clear`,
      action: (download: DownloadSummary) => this.clearDownload(download),
      show: (download: DownloadSummary) => download.finished || download.paused,
      icon: 'delete'
    }
  ]

  downloads_retrieved = false;

  innerWidth: number;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.innerWidth = window.innerWidth;
    this.recalculateColumns();
  }

  sort_downloads = (a: DownloadSummary, b: DownloadSummary): number => {
    const result = b.timestamp_start - a.timestamp_start;
    return result;
  }

  constructor(public postsService: PostsService, private router: Router, private dialog: MatDialog, private clipboard: Clipboard) { }

  ngOnInit(): void {
    // Remove sub name as it's not necessary for one-off downloads
    if (this.uids) this.displayedColumnsBig = this.displayedColumnsBig.filter(col => col !== 'sub_name');
    this.innerWidth = window.innerWidth;
    this.recalculateColumns();
    if (this.postsService.initialized) {
      this.getCurrentDownloadsRecurring();
    } else {
      this.postsService.service_initialized.pipe(takeUntil(this.destroyed)).subscribe(init => {
        if (init) {
          this.getCurrentDownloadsRecurring();
        }
      });
    }
  }

  getCurrentDownloadsRecurring(): void {
    if (!this.postsService.config['Extra']['enable_downloads_manager']) {
      this.router.navigate(['/home']);
      return;
    }
    if (this.polling) return;
    this.polling = true;
    // exhaustMap skips a tick while the previous request is still in flight, so requests never overlap
    timer(0, this.downloads_check_interval).pipe(
      exhaustMap(() => this.postsService.getCurrentDownloads(this.uids).pipe(catchError(() => of(null)))),
      takeUntil(this.destroyed)
    ).subscribe(res => this.updateDownloads(res));
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }

  // res is null if the request failed: keep the downloads we have, the next tick tries again
  updateDownloads(res: GetAllDownloadsResponse | null): void {
    if (!res) return;
    const downloads_json = JSON.stringify(res.downloads);
    if (res.downloads && downloads_json !== this.last_downloads_json) {
      this.last_downloads_json = downloads_json;
      this.downloads = this.combineDownloads(this.downloads, res.downloads);
      this.downloads.sort(this.sort_downloads);
      this.dataSource = new MatTableDataSource<DownloadSummary>(this.downloads);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.paused_download_exists = this.downloads.some(download => download.paused && !download.has_error);
      this.running_download_exists = this.downloads.some(download => !download.paused && !download.finished);
    }
    this.downloads_retrieved = true;
  }

  clearDownloadsByType(): void {
    const clearEmitter = new EventEmitter<boolean>();
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogType: 'selection_list',
        dialogTitle: $localize`Clear downloads`,
        dialogText: $localize`Select downloads to clear`,
        submitText: $localize`Clear`,
        doneEmitter: clearEmitter,
        warnSubmitColor: true,
        list: [
          {
            title: $localize`Finished downloads`,
            key: 'clear_finished'
          },
          {
            title: $localize`Paused downloads`,
            key: 'clear_paused'
          },
          {
            title: $localize`Errored downloads`,
            key: 'clear_errors'
          }
        ]
      }
    });
    clearEmitter.subscribe((done: boolean) => {
      if (done) {
        const selected_items = dialogRef.componentInstance.selected_items;
        this.postsService.clearDownloads(selected_items.includes('clear_finished'), selected_items.includes('clear_paused'), selected_items.includes('clear_errors')).subscribe(res => {
          if (!res['success']) {
            this.postsService.openSnackBar($localize`Failed to clear finished downloads!`);
          } else {
            this.postsService.openSnackBar($localize`Cleared downloads!`);
            dialogRef.close();
          }
        });
      }
    });
  }

  pauseDownload(download: DownloadSummary): void {
    this.postsService.pauseDownload(download['uid']).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to pause download! See server logs for more info.`);
      }
    });
  }

  pauseAllDownloads(): void {
    this.postsService.pauseAllDownloads().subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to pause all downloads! See server logs for more info.`);
      }
    });
  }

  resumeDownload(download: DownloadSummary): void {
    this.postsService.resumeDownload(download['uid']).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to resume download! See server logs for more info.`);
      }
    });
  }

  resumeAllDownloads(): void {
    this.postsService.resumeAllDownloads().subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to resume all downloads! See server logs for more info.`);
      }
    });
  }

  restartDownload(download: DownloadSummary): void {
    this.postsService.restartDownload(download['uid']).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to restart download! See server logs for more info.`);
      } else {
        if (this.uids && res['new_download_uid']) {
          this.uids.push(res['new_download_uid']);
        }
      }
    });
  }

  cancelDownload(download: DownloadSummary): void {
    this.postsService.cancelDownload(download['uid']).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to cancel download! See server logs for more info.`);
      }
    });
  }

  clearDownload(download: DownloadSummary): void {
    this.postsService.clearDownload(download['uid']).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar($localize`Failed to pause download! See server logs for more info.`);
      }
    });
  }

  watchContent(download: DownloadSummary): void {
    const container = download['container'];
    localStorage.setItem('player_navigator', this.router.url.split(';')[0]);
    const is_playlist = container['uids']; // hacky, TODO: fix
    if (is_playlist) {
      this.router.navigate(['/player', {playlist_id: container['id'], type: download['type']}]);
    } else {
      this.router.navigate(['/player', {type: download['type'], uid: container['uid']}]);
    }
  }

  combineDownloads(downloads_old: DownloadSummary[], downloads_new: DownloadSummary[]): DownloadSummary[] {
    const old_by_uid = new Map(downloads_old.map(download_old => [download_old.uid, download_old]));

    // only keeps downloads that exist in the new set; known ones are updated in place so their rows keep their identity
    return downloads_new.map(download_new => {
      const download_old = old_by_uid.get(download_new.uid);
      if (!download_old) return download_new;
      Object.keys(download_old).forEach(key => {
        if (!(key in download_new)) delete download_old[key];
      });
      return Object.assign(download_old, download_new);
    });
  }

  // The list only says whether a download has an error; the text is loaded when the user asks for it
  showError(download: DownloadSummary): void {
    if (this.error_loading_uids.has(download.uid)) return;
    this.error_loading_uids.add(download.uid);
    this.postsService.getCurrentDownload(download.uid).pipe(
      takeUntil(this.destroyed),
      finalize(() => this.error_loading_uids.delete(download.uid))
    ).subscribe({
      next: res => {
        const error_text = res.download ? res.download.error : null;
        if (error_text) {
          this.openErrorDialog(download.url, error_text);
        } else {
          this.postsService.openSnackBar($localize`The error is no longer available. The download may have been cleared.`);
        }
      },
      error: () => this.postsService.openSnackBar($localize`Failed to load the error! See server logs for more info.`)
    });
  }

  openErrorDialog(url: string, error_text: string): void {
    const copyToClipboardEmitter = new EventEmitter<boolean>();
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: $localize`Error for ${url}:url:`,
        dialogText: error_text,
        submitText: $localize`Copy to clipboard`,
        cancelText: $localize`Close`,
        closeOnSubmit: false,
        onlyEmitOnDone: true,
        doneEmitter: copyToClipboardEmitter
      }
    });
    copyToClipboardEmitter.subscribe(done => {
      if (done) {
        this.postsService.openSnackBar($localize`Copied to clipboard!`);
        this.clipboard.copy(error_text);
      }
    });
  }

  recalculateColumns() {
    if (this.innerWidth < 650) this.displayedColumns = this.displayedColumnsSmall;
    else                       this.displayedColumns = this.displayedColumnsBig;

    this.actionsFlex = this.uids || this.innerWidth < 800 ? 1 : 2;

    if (this.innerWidth < 800 && !this.uids || this.innerWidth < 1100 && this.uids) this.minimizeButtons = true;
    else                                                                            this.minimizeButtons = false;
  }
}

interface DownloadAction {
  tooltip: string,
  action: (download: DownloadSummary) => void,
  show: (download: DownloadSummary) => boolean,
  icon: string,
  loading?: (download: DownloadSummary) => boolean
}