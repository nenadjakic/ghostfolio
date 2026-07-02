import { IcsService } from '@ghostfolio/client/services/ics/ics.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { DEFAULT_PAGE_SIZE } from '@ghostfolio/common/config';
import { downloadAsFile } from '@ghostfolio/common/helper';
import {
  Activity,
  AssetProfileIdentifier,
  LookupItem,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import { DateRange } from '@ghostfolio/common/types';
import { GfActivitiesTableComponent } from '@ghostfolio/ui/activities-table';
import { GfEntityLogoComponent } from '@ghostfolio/ui/entity-logo';
import { GfFabComponent } from '@ghostfolio/ui/fab';
import { translate } from '@ghostfolio/ui/i18n';
import { DataService } from '@ghostfolio/ui/services';
import { GfSymbolAutocompleteComponent } from '@ghostfolio/ui/symbol-autocomplete';

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Sort, SortDirection } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { Type as ActivityType } from '@prisma/client';
import { format, parseISO } from 'date-fns';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { DeviceDetectorService } from 'ngx-device-detector';

import { GfImportActivitiesDialogComponent } from './import-activities-dialog/import-activities-dialog.component';
import { ImportActivitiesDialogParams } from './import-activities-dialog/interfaces/interfaces';

interface ActiveFilterChip {
  label: string;
  tooltip?: string;
  type: 'ACCOUNT' | 'SYMBOL' | 'TYPE';
  value: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfActivitiesTableComponent,
    GfEntityLogoComponent,
    GfFabComponent,
    GfSymbolAutocompleteComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    IonIcon,
    MatSelectModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatTooltipModule,
    ReactiveFormsModule,
    RouterModule
  ],
  selector: 'gf-activities-page',
  styleUrls: ['./activities-page.scss'],
  templateUrl: './activities-page.html'
})
export class GfActivitiesPageComponent implements OnInit {
  protected activityTypes = Object.values(ActivityType);
  protected activityTypesTranslationMap = new Map<ActivityType, string>();
  protected dataSource: MatTableDataSource<Activity> | undefined;
  protected deviceType: string;
  protected hasImpersonationId: boolean;
  protected hasPermissionToCreateActivity: boolean;
  protected hasPermissionToDeleteActivity: boolean;
  protected readonly internalRoutes = internalRoutes;
  protected isFilterFormOpen = false;
  protected pageIndex = 0;
  protected readonly pageSize = DEFAULT_PAGE_SIZE;
  protected sortColumn = 'date';
  protected sortDirection: SortDirection = 'desc';
  protected totalItems: number | undefined;
  protected user: User;

  private hasInitializedFilters = false;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);
  private readonly icsService = inject(IcsService);
  private readonly impersonationStorageService = inject(
    ImpersonationStorageService
  );
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  protected drawerFiltersForm = this.formBuilder.nonNullable.group({
    accounts: this.formBuilder.nonNullable.control<string[]>([]),
    activityTypes: this.formBuilder.nonNullable.control<ActivityType[]>([]),
    symbol: this.formBuilder.control<LookupItem | null>(null)
  });
  protected filtersForm = this.formBuilder.nonNullable.group({
    accounts: this.formBuilder.nonNullable.control<string[]>([]),
    activityTypes: this.formBuilder.nonNullable.control<ActivityType[]>([]),
    symbol: this.formBuilder.control<LookupItem | null>(null)
  });

  public constructor() {
    addIcons({ closeOutline });

    for (const type of this.activityTypes) {
      this.activityTypesTranslationMap.set(type, translate(type));
    }
  }

  public ngOnInit() {
    this.deviceType = this.deviceDetectorService.getDeviceInfo().deviceType;

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;

        this.changeDetectorRef.markForCheck();
      });

    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.updateUser(state.user);

          this.fetchActivities();

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  protected get activeFilterCount() {
    const { accounts, activityTypes, symbol } = this.filtersForm.getRawValue();

    return (
      accounts.length +
      activityTypes.length +
      (symbol?.dataSource && symbol.symbol ? 1 : 0)
    );
  }

  protected get activeFilterChips(): ActiveFilterChip[] {
    const { accounts, activityTypes, symbol } = this.filtersForm.getRawValue();
    const accountMap = new Map(
      (this.user?.accounts ?? []).map(({ id, name }) => {
        return [id, name] as const;
      })
    );
    const accountNames = accounts.map((accountId) => {
      return accountMap.get(accountId) ?? accountId;
    });
    const translatedActivityTypes = activityTypes.map((activityType) => {
      return this.activityTypesTranslationMap.get(activityType) ?? activityType;
    });
    const chips: ActiveFilterChip[] = [];

    if (accountNames.length > 0) {
      chips.push({
        label: $localize`Accounts`,
        tooltip: accountNames.join(', '),
        type: 'ACCOUNT',
        value:
          accountNames.length === 1 ? accountNames[0] : `${accountNames.length}`
      });
    }

    if (translatedActivityTypes.length > 0) {
      chips.push({
        label: $localize`Type`,
        tooltip: translatedActivityTypes.join(', '),
        type: 'TYPE',
        value:
          translatedActivityTypes.length === 1
            ? translatedActivityTypes[0]
            : `${translatedActivityTypes.length}`
      });
    }

    if (symbol?.dataSource && symbol.symbol) {
      chips.push({
        label: $localize`Asset`,
        tooltip: symbol.name
          ? `${symbol.name} (${symbol.dataSource})`
          : symbol.dataSource,
        type: 'SYMBOL',
        value: symbol.symbol
      });
    }

    return chips;
  }

  protected onApplyFilters() {
    this.filtersForm.patchValue(this.drawerFiltersForm.getRawValue());
    this.pageIndex = 0;
    this.isFilterFormOpen = false;

    this.fetchActivities();
  }

  protected onChangePage(page: PageEvent) {
    this.pageIndex = page.pageIndex;

    this.fetchActivities();
  }

  protected onClearDrawerFilters() {
    this.drawerFiltersForm.patchValue({
      accounts: [],
      activityTypes: [],
      symbol: null
    });
  }

  protected onClickActivity({ dataSource, symbol }: AssetProfileIdentifier) {
    this.router.navigate([], {
      queryParams: {
        dataSource,
        symbol,
        holdingDetailDialog: true
      }
    });
  }

  protected onCloseFilterDrawer() {
    this.isFilterFormOpen = false;
  }

  protected onDeleteActivities() {
    this.dataService
      .deleteActivities({
        filters: this.getSelectedFilters()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onDeleteActivity(aId: string) {
    this.dataService
      .deleteActivity(aId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onExport(activityIds?: string[]) {
    let fetchExportParams: any = { activityIds };

    if (!activityIds) {
      fetchExportParams = {
        activityTypes: this.getSelectedActivityTypes(),
        filters: this.getSelectedFilters()
      };
    }

    this.dataService
      .fetchExport(fetchExportParams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        for (const activity of data.activities) {
          delete (activity as Omit<typeof activity, 'id'> & { id?: string }).id;
        }

        downloadAsFile({
          content: data,
          fileName: `ghostfolio-export-${format(
            parseISO(data.meta.date),
            'yyyyMMddHHmm'
          )}.json`,
          format: 'json'
        });
      });
  }

  protected onExportDrafts(activityIds?: string[]) {
    this.dataService
      .fetchExport({ activityIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        downloadAsFile({
          content: this.icsService.transformActivitiesToIcsContent(
            data.activities
          ),
          contentType: 'text/calendar',
          fileName: `ghostfolio-draft${
            data.activities.length > 1 ? 's' : ''
          }-${format(parseISO(data.meta.date), 'yyyyMMddHHmmss')}.ics`,
          format: 'string'
        });
      });
  }

  protected onImport() {
    const dialogRef = this.dialog.open<
      GfImportActivitiesDialogComponent,
      ImportActivitiesDialogParams
    >(GfImportActivitiesDialogComponent, {
      data: {
        deviceType: this.deviceType,
        user: this.user
      },
      height: this.deviceType === 'mobile' ? '98vh' : undefined,
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onImportDividends() {
    const dialogRef = this.dialog.open<
      GfImportActivitiesDialogComponent,
      ImportActivitiesDialogParams
    >(GfImportActivitiesDialogComponent, {
      data: {
        activityTypes: ['DIVIDEND'],
        deviceType: this.deviceType,
        user: this.user
      },
      height: this.deviceType === 'mobile' ? '98vh' : undefined,
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        this.fetchActivities();

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onOpenFilterDrawer() {
    this.syncDrawerFiltersWithActiveFilters();
    this.isFilterFormOpen = true;
  }

  protected onRemoveActiveFilterChip(chip: ActiveFilterChip) {
    if (chip.type === 'ACCOUNT') {
      this.filtersForm.controls.accounts.setValue([]);
    } else if (chip.type === 'TYPE') {
      this.filtersForm.controls.activityTypes.setValue([]);
    } else {
      this.filtersForm.controls.symbol.setValue(null);
    }

    this.syncDrawerFiltersWithActiveFilters();
    this.pageIndex = 0;

    this.fetchActivities();
  }

  protected onSortChanged({ active, direction }: Sort) {
    this.pageIndex = 0;
    this.sortColumn = active;
    this.sortDirection = direction;

    this.fetchActivities();
  }

  private fetchActivities() {
    // Reset dataSource and totalItems to show loading state
    this.dataSource = undefined;
    this.totalItems = undefined;

    const dateRange = this.user?.settings?.dateRange;
    const range = this.isCalendarYear(dateRange) ? dateRange : undefined;

    this.dataService
      .fetchActivities({
        range,
        activityTypes: this.getSelectedActivityTypes(),
        filters: this.getSelectedFilters(),
        skip: this.pageIndex * this.pageSize,
        sortColumn: this.sortColumn,
        sortDirection: this.sortDirection,
        take: this.pageSize
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ activities, count }) => {
        this.dataSource = new MatTableDataSource(activities);
        this.totalItems = count;

        if (
          this.hasPermissionToCreateActivity &&
          this.user?.activitiesCount === 0
        ) {
          void this.router.navigate(
            internalRoutes.portfolio.subRoutes.activities.subRoutes.create
              .routerLink
          );
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  private getSelectedActivityTypes() {
    const activityTypes = this.filtersForm.controls.activityTypes.getRawValue();

    return activityTypes.length > 0 ? activityTypes : undefined;
  }

  private getSelectedFilters() {
    const { accounts, symbol } = this.filtersForm.getRawValue();
    const assetProfile =
      symbol?.dataSource && symbol.symbol
        ? { dataSource: symbol.dataSource, symbol: symbol.symbol }
        : null;
    const baseFilters = this.userService.getFilters().filter(({ type }) => {
      return (
        type !== 'ACCOUNT' &&
        (!assetProfile || (type !== 'DATA_SOURCE' && type !== 'SYMBOL'))
      );
    });

    return [
      ...baseFilters,
      ...accounts.map((id) => {
        return { id, type: 'ACCOUNT' as const };
      }),
      ...(assetProfile
        ? [
            {
              id: assetProfile.dataSource,
              type: 'DATA_SOURCE' as const
            },
            {
              id: assetProfile.symbol,
              type: 'SYMBOL' as const
            }
          ]
        : [])
    ];
  }

  private isCalendarYear(dateRange?: DateRange) {
    if (!dateRange) {
      return false;
    }

    return /^\d{4}$/.test(dateRange);
  }

  private syncDrawerFiltersWithActiveFilters() {
    this.drawerFiltersForm.patchValue(this.filtersForm.getRawValue(), {
      emitEvent: false
    });
  }

  private updateUser(aUser: User) {
    this.user = aUser;

    if (!this.hasInitializedFilters) {
      const existingFilters = this.userService.getFilters();

      const existingDataSource = existingFilters.find(({ type }) => {
        return type === 'DATA_SOURCE';
      })?.id;
      const existingSymbol = existingFilters.find(({ type }) => {
        return type === 'SYMBOL';
      })?.id;

      this.filtersForm.patchValue(
        {
          accounts: existingFilters
            .filter(({ type }) => {
              return type === 'ACCOUNT';
            })
            .map(({ id }) => {
              return id;
            }),
          symbol:
            existingDataSource && existingSymbol
              ? ({
                  currency: '',
                  dataProviderInfo: { isPremium: false },
                  dataSource: existingDataSource,
                  name: existingSymbol,
                  symbol: existingSymbol
                } as LookupItem)
              : null
        },
        { emitEvent: false }
      );

      this.syncDrawerFiltersWithActiveFilters();

      this.hasInitializedFilters = true;
    }

    this.hasPermissionToCreateActivity =
      !this.hasImpersonationId &&
      hasPermission(this.user.permissions, permissions.createActivity);
    this.hasPermissionToDeleteActivity =
      !this.hasImpersonationId &&
      hasPermission(this.user.permissions, permissions.deleteActivity);
  }
}
