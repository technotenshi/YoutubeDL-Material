import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Clipboard } from '@angular/cdk/clipboard';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { Download, DownloadSummary, GetAllDownloadsResponse, GetDownloadResponse } from 'api-types';
import { PostsService } from 'app/posts.services';

import { DownloadsComponent } from './downloads.component';

// A list entry as POST /api/downloads returns it: no error text, only has_error.
function summary(overrides: Partial<DownloadSummary> = {}): DownloadSummary {
  return {
    uid: 'uid', url: 'https://example.com/v', type: 'video', title: 'A title', timestamp_start: 1000, step_index: 0,
    percent_complete: null, finished: false, running: false, paused: false, finished_step: true, has_error: false,
    ...overrides
  };
}

describe('DownloadsComponent', () => {
  let fixture: ComponentFixture<DownloadsComponent>;
  let component: DownloadsComponent;

  // POST /api/downloads and POST /api/download are answered by hand, so a test decides when a request returns.
  let list_requests: Subject<GetAllDownloadsResponse>[];
  let detail_requests: Subject<GetDownloadResponse>[];
  let posts_service: any;
  let dialog: { open: jasmine.Spy };
  let clipboard: { copy: jasmine.Spy };
  let router: { navigate: jasmine.Spy, url: string };

  const respondToList = (index: number, downloads: DownloadSummary[]) => {
    list_requests[index].next({downloads: downloads});
    list_requests[index].complete();
  };
  const respondToDetail = (index: number, download: Partial<Download> | null) => {
    detail_requests[index].next({download: download as Download});
    detail_requests[index].complete();
  };

  function createComponent(uids: string[] = null): void {
    fixture = TestBed.createComponent(DownloadsComponent);
    component = fixture.componentInstance;
    component.uids = uids;
    fixture.detectChanges(); // ngOnInit starts the recurring check
  }

  // The recurring check is a periodic timer: destroy the component at the end, or fakeAsync fails with a timer left in the queue.
  const fakeAsyncAndDestroy = (test: () => void) => fakeAsync(() => {
    try {
      test();
    } finally {
      if (fixture) fixture.destroy();
    }
  });

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('mat-row'));
  const cellText = (row: HTMLElement, column: string): string => row.querySelector(`.mat-column-${column}`).textContent.trim();
  const icons = (row: HTMLElement): string[] => Array.from(row.querySelectorAll('button mat-icon')).map(icon => icon.textContent.trim());

  beforeEach(() => {
    list_requests = [];
    detail_requests = [];
    posts_service = {
      initialized: true,
      service_initialized: new BehaviorSubject<boolean>(true),
      config: {Extra: {enable_downloads_manager: true}},
      getCurrentDownloads: jasmine.createSpy('getCurrentDownloads').and.callFake(() => {
        list_requests.push(new Subject());
        return list_requests[list_requests.length - 1].asObservable();
      }),
      getCurrentDownload: jasmine.createSpy('getCurrentDownload').and.callFake(() => {
        detail_requests.push(new Subject());
        return detail_requests[detail_requests.length - 1].asObservable();
      }),
      openSnackBar: jasmine.createSpy('openSnackBar')
    };
    dialog = {open: jasmine.createSpy('open')};
    clipboard = {copy: jasmine.createSpy('copy')};
    router = {navigate: jasmine.createSpy('navigate'), url: '/downloads'};
    // wide enough that the actions show as buttons instead of a menu
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);

    TestBed.configureTestingModule({
      declarations: [DownloadsComponent],
      imports: [NoopAnimationsModule, MatTableModule, MatSortModule, MatPaginatorModule, MatMenuModule, MatButtonModule, MatIconModule,
                MatTooltipModule, MatProgressSpinnerModule],
      providers: [
        {provide: PostsService, useValue: posts_service},
        {provide: MatDialog, useValue: dialog},
        {provide: Clipboard, useValue: clipboard},
        {provide: Router, useValue: router}
      ]
    });
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  describe('checking for downloads', () => {
    it('asks right away and then every second', fakeAsyncAndDestroy(() => {
      createComponent();
      tick(0);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(1);
      respondToList(0, []);

      tick(1000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(2);
      respondToList(1, []);

      tick(1000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(3);
    }));

    it('sends no new request while the previous one is in flight', fakeAsyncAndDestroy(() => {
      createComponent();
      tick(5000); // five ticks pass with the first request unanswered
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(1);

      respondToList(0, []);
      tick(1000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(2);
    }));

    it('keeps the downloads it has when a request fails, and tries again', fakeAsyncAndDestroy(() => {
      createComponent();
      tick(0);
      respondToList(0, [summary({uid: 'a', title: 'Kept'})]);
      fixture.detectChanges();
      expect(rows().length).toBe(1);

      tick(1000);
      list_requests[1].error(new Error('network'));
      fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect(cellText(rows()[0], 'title')).toBe('Kept');

      tick(1000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(3);
    }));

    it('does not show "No downloads available" when the first request fails', fakeAsyncAndDestroy(() => {
      createComponent();
      tick(0);
      list_requests[0].error(new Error('network'));
      fixture.detectChanges();

      expect(component.downloads_retrieved).toBe(false);
      expect(fixture.nativeElement.textContent).not.toContain('No downloads available');
    }));

    it('starts only one recurring check however often it is asked', fakeAsyncAndDestroy(() => {
      createComponent();
      component.getCurrentDownloadsRecurring();
      tick(0);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(1);
      respondToList(0, []);

      tick(1000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(2);
    }));

    it('cancels the request in flight and stops checking when destroyed', fakeAsyncAndDestroy(() => {
      createComponent();
      tick(0);
      expect(list_requests[0].observers.length).toBe(1);

      fixture.destroy();
      expect(list_requests[0].observers.length).toBe(0);
      tick(5000);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledTimes(1);
    }));

    it('asks only for the uids it is given, as the home page embed does', fakeAsyncAndDestroy(() => {
      createComponent(['a', 'b']);
      tick(0);
      expect(posts_service.getCurrentDownloads).toHaveBeenCalledWith(['a', 'b']);
      fixture.destroy();
    }));
  });

  describe('showing downloads', () => {
    const downloads = [
      summary({uid: 'creating', title: 'Creating', timestamp_start: 7000, step_index: 0}),
      summary({uid: 'running', title: 'Running', timestamp_start: 6000, step_index: 2, percent_complete: 40, running: true, finished_step: false}),
      summary({uid: 'zero', title: 'Zero', timestamp_start: 5000, step_index: 2, percent_complete: 0, running: true, finished_step: false}),
      summary({uid: 'paused', title: 'Paused', timestamp_start: 4000, step_index: 1, paused: true}),
      summary({uid: 'done', title: 'Done', timestamp_start: 3000, step_index: 3, percent_complete: 100, finished: true, container: {uid: 'file'}}),
    ];

    function showDownloads(shown: DownloadSummary[]): void {
      createComponent();
      tick(0);
      respondToList(0, shown);
      fixture.detectChanges();
    }

    it('shows each status and its buttons, newest first', fakeAsyncAndDestroy(() => {
      showDownloads(downloads);

      expect(rows().map(row => cellText(row, 'title'))).toEqual(['Creating', 'Running', 'Zero', 'Paused', 'Done']);
      expect(rows().map(row => cellText(row, 'percent_complete'))).toEqual(['Creating download', '40%', 'N/A', 'Getting info', 'Complete']);
      expect(icons(rows()[0])).toEqual(['pause', 'cancel']);
      expect(icons(rows()[1])).toEqual(['pause', 'cancel']);
      expect(icons(rows()[3])).toEqual(['play_arrow', 'delete']);
      expect(icons(rows()[4])).toEqual(['smart_display', 'restart_alt', 'delete']);
    }));

    it('shows a download with an error as an error, with the error button', fakeAsyncAndDestroy(() => {
      showDownloads([summary({uid: 'failed', title: 'Failed', step_index: 1, finished: true, has_error: true})]);

      expect(cellText(rows()[0], 'percent_complete')).toBe('Error');
      expect(icons(rows()[0])).toEqual(['warning', 'restart_alt', 'delete']);
    }));

    it('enables pause all and resume all by what is listed', fakeAsyncAndDestroy(() => {
      showDownloads(downloads);
      expect(component.running_download_exists).toBe(true);
      expect(component.paused_download_exists).toBe(true);

      tick(1000);
      respondToList(1, [summary({uid: 'failed', finished: true, paused: true, has_error: true})]);
      expect(component.running_download_exists).toBe(false);
      expect(component.paused_download_exists).toBe(false);
    }));

    it('updates a row when its download changes and drops it when it is gone', fakeAsyncAndDestroy(() => {
      showDownloads([summary({uid: 'a', title: 'A', timestamp_start: 2, step_index: 2, percent_complete: 10, running: true}),
                     summary({uid: 'b', title: 'B', timestamp_start: 1})]);
      expect(cellText(rows()[0], 'percent_complete')).toBe('10%');

      tick(1000);
      respondToList(1, [summary({uid: 'a', title: 'A', timestamp_start: 2, step_index: 2, percent_complete: 55, running: true})]);
      fixture.detectChanges();

      expect(rows().length).toBe(1);
      expect(cellText(rows()[0], 'percent_complete')).toBe('55%');
    }));

    it('opens the player for a finished download', fakeAsyncAndDestroy(() => {
      showDownloads([downloads[4]]);

      (rows()[0].querySelector('button mat-icon') as HTMLElement).click();

      expect(router.navigate).toHaveBeenCalledWith(['/player', {type: 'video', uid: 'file'}]);
    }));

    it('keeps false and zero values when it merges an update into a row', () => {
      createComponent();
      const old = [summary({uid: 'a', paused: true, step_index: 2, percent_complete: 50, cancelled: true})];

      const combined = component.combineDownloads(old, [summary({uid: 'a', paused: false, step_index: 0, percent_complete: 0})]);

      expect(combined.length).toBe(1);
      expect(combined[0]).toBe(old[0]); // updated in place
      expect(combined[0].paused).toBe(false);
      expect(combined[0].step_index).toBe(0);
      expect(combined[0].percent_complete).toBe(0);
      expect('cancelled' in combined[0]).toBe(false);
    });
  });

  describe('showing an error', () => {
    const errored = summary({uid: 'failed', url: 'https://example.com/failed', finished: true, step_index: 1, has_error: true});

    function clickShowError(): void {
      const button = rows()[0].querySelector('button') as HTMLElement;
      expect(button.querySelector('mat-icon').textContent.trim()).toBe('warning');
      button.click();
      fixture.detectChanges();
    }

    function showErrored(): void {
      createComponent();
      tick(0);
      respondToList(0, [errored]);
      fixture.detectChanges();
    }

    it('loads the error text of that download when the button is clicked, and shows it in the dialog', fakeAsyncAndDestroy(() => {
      showErrored();
      expect(posts_service.getCurrentDownload).not.toHaveBeenCalled();

      clickShowError();
      expect(posts_service.getCurrentDownload).toHaveBeenCalledOnceWith('failed');
      expect(dialog.open).not.toHaveBeenCalled();

      respondToDetail(0, {uid: 'failed', error: 'ERROR: video unavailable'});
      expect(dialog.open).toHaveBeenCalledTimes(1);
      const data = dialog.open.calls.mostRecent().args[1].data;
      expect(data.dialogText).toBe('ERROR: video unavailable');
      expect(data.dialogTitle).toContain('https://example.com/failed');
    }));

    it('copies exactly the loaded error text', fakeAsyncAndDestroy(() => {
      showErrored();
      clickShowError();
      respondToDetail(0, {uid: 'failed', error: 'line one\nline two'});

      dialog.open.calls.mostRecent().args[1].data.doneEmitter.emit(true);

      expect(clipboard.copy).toHaveBeenCalledOnceWith('line one\nline two');
    }));

    it('sends one request however often the button is clicked while it loads', fakeAsyncAndDestroy(() => {
      showErrored();
      clickShowError();
      component.showError(errored); // a second click before the disabled button is rendered

      expect(posts_service.getCurrentDownload).toHaveBeenCalledTimes(1);
      expect(component.error_loading_uids.has('failed')).toBe(true);

      respondToDetail(0, {uid: 'failed', error: 'e'});
      expect(component.error_loading_uids.has('failed')).toBe(false);
    }));

    it('says so when the error is gone, without opening the dialog', fakeAsyncAndDestroy(() => {
      showErrored();
      clickShowError();
      respondToDetail(0, null);

      expect(dialog.open).not.toHaveBeenCalled();
      expect(posts_service.openSnackBar).toHaveBeenCalledTimes(1);
      expect(component.error_loading_uids.size).toBe(0);
    }));

    it('says so when the request fails, and lets the user try again', fakeAsyncAndDestroy(() => {
      showErrored();
      clickShowError();
      detail_requests[0].error(new Error('network'));
      fixture.detectChanges(); // the button is disabled while the error loads

      expect(dialog.open).not.toHaveBeenCalled();
      expect(posts_service.openSnackBar).toHaveBeenCalledTimes(1);

      clickShowError();
      expect(posts_service.getCurrentDownload).toHaveBeenCalledTimes(2);
    }));

    it('drops the request when the component is destroyed', fakeAsyncAndDestroy(() => {
      showErrored();
      clickShowError();

      fixture.destroy();

      expect(detail_requests[0].observers.length).toBe(0);
    }));
  });
});
