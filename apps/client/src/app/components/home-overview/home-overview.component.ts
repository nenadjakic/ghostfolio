import { GfPortfolioPerformanceComponent } from '@ghostfolio/client/components/portfolio-performance/portfolio-performance.component';
import { LayoutService } from '@ghostfolio/client/core/layout.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import {
  DEFAULT_CURRENCY,
  DEFAULT_DATE_RANGE,
  NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
} from '@ghostfolio/common/config';
import {
  AssetProfileIdentifier,
  Filter,
  LineChartItem,
  PortfolioPerformance,
  ToggleOption,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { internalRoutes } from '@ghostfolio/common/routes/routes';
import { DateRange } from '@ghostfolio/common/types';
import { GfLineChartComponent } from '@ghostfolio/ui/line-chart';
import { DataService } from '@ghostfolio/ui/services';
import { GfToggleComponent } from '@ghostfolio/ui/toggle';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule } from '@angular/router';
import { DeviceDetectorService } from 'ngx-device-detector';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfLineChartComponent,
    GfPortfolioPerformanceComponent,
    GfToggleComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    RouterModule
  ],
  selector: 'gf-home-overview',
  styleUrls: ['./home-overview.scss'],
  templateUrl: './home-overview.html'
})
export class GfHomeOverviewComponent implements OnInit {
  protected readonly dateRangeOptions: ToggleOption[] = [
    {
      label: 'MAX',
      tooltip: $localize`Maximum period`,
      value: 'max'
    },
    {
      label: 'YTD',
      tooltip: $localize`Year to date`,
      value: 'ytd'
    },
    {
      label: 'MTD',
      tooltip: $localize`Month to date`,
      value: 'mtd'
    },
    {
      label: 'WTD',
      tooltip: $localize`Week to date`,
      value: 'wtd'
    },
    {
      label: '1Y',
      tooltip: '1 ' + $localize`year`,
      value: '1y'
    },
    {
      label: '5Y',
      tooltip: '5 ' + $localize`years`,
      value: '5y'
    }
  ];
  protected readonly errors = signal<AssetProfileIdentifier[]>([]);
  protected readonly hasImpersonationId = signal(false);
  protected readonly historicalDataItems = signal<LineChartItem[] | null>(null);
  protected readonly isLoadingPerformance = signal(true);
  protected readonly performance = signal<PortfolioPerformance | null>(null);
  protected readonly performanceLabel = $localize`Performance`;
  protected readonly precision = signal(2);
  protected readonly selectedAccountIds = signal<string[]>([]);
  protected readonly selectedDateRange = signal<DateRange>('max');
  protected readonly user = signal<User | null>(null);

  protected readonly routerLinkAccounts = internalRoutes.accounts.routerLink;
  protected readonly routerLinkPortfolio = internalRoutes.portfolio.routerLink;
  protected readonly routerLinkPortfolioActivities =
    internalRoutes.portfolio.subRoutes.activities.routerLink;

  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );

  protected readonly hasPermissionToCreateActivity = computed(() => {
    return hasPermission(this.user()?.permissions, permissions.createActivity);
  });

  protected readonly showDetails = computed(() => {
    const user = this.user();

    return user
      ? !user.settings.isRestrictedView && user.settings.viewMode !== 'ZEN'
      : false;
  });

  protected readonly unit = computed(() => {
    return this.showDetails()
      ? (this.user()?.settings?.baseCurrency ?? DEFAULT_CURRENCY)
      : '%';
  });

  protected readonly selectedAccountsLabel = computed(() => {
    const selectedAccountIds = this.selectedAccountIds();
    const accounts = this.user()?.accounts ?? [];

    if (selectedAccountIds.length === 0) {
      return $localize`All accounts`;
    }

    if (selectedAccountIds.length === 1) {
      return (
        accounts.find(({ id }) => {
          return id === selectedAccountIds[0];
        })?.name ?? selectedAccountIds[0]
      );
    }

    return `${selectedAccountIds.length} ${$localize`accounts selected`}`;
  });

  private hasInitializedDateRange = false;

  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly impersonationStorageService = inject(
    ImpersonationStorageService
  );
  private readonly layoutService = inject(LayoutService);
  private readonly userService = inject(UserService);

  public constructor() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user.set(state.user);

          if (!this.hasInitializedDateRange) {
            this.selectedDateRange.set(
              state.user.settings?.dateRange ?? DEFAULT_DATE_RANGE
            );
            this.hasInitializedDateRange = true;
          }

          this.update();
        }
      });
  }

  public ngOnInit() {
    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId.set(!!impersonationId);
      });

    this.layoutService.shouldReloadContent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.update();
      });
  }

  protected onDateRangeChange(dateRange: DateRange) {
    this.selectedDateRange.set(dateRange);
    this.update();
  }

  protected onSelectedAccountsChange(accountIds: string[]) {
    this.selectedAccountIds.set(accountIds ?? []);
    this.update();
  }

  private update() {
    this.historicalDataItems.set(null);
    this.isLoadingPerformance.set(true);

    const filters: Filter[] = this.selectedAccountIds().map((id) => {
      return {
        id,
        type: 'ACCOUNT'
      };
    });

    this.dataService
      .fetchPortfolioPerformance({
        filters,
        range: this.selectedDateRange() ?? DEFAULT_DATE_RANGE
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ chart, errors, performance }) => {
        this.errors.set(errors ?? []);
        this.performance.set(performance);

        this.historicalDataItems.set(
          chart?.map(
            ({ date, netPerformanceInPercentageWithCurrencyEffect }) => {
              return {
                date,
                value: (netPerformanceInPercentageWithCurrencyEffect ?? 0) * 100
              };
            }
          ) ?? null
        );

        this.precision.set(2);

        if (
          this.deviceType() === 'mobile' &&
          performance.currentValueInBaseCurrency >=
            NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
        ) {
          this.precision.set(0);
        }

        this.isLoadingPerformance.set(false);
      });
  }
}
