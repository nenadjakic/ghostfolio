import { userDummyData } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator-test-utils';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { CurrentRateServiceMock } from '@ghostfolio/api/app/portfolio/current-rate.service.mock';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { RedisCacheServiceMock } from '@ghostfolio/api/app/redis-cache/redis-cache.service.mock';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PortfolioSnapshotService } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshotServiceMock } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service.mock';
import { parseDate } from '@ghostfolio/common/helper';
import { Filter } from '@ghostfolio/common/interfaces';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { Big } from 'big.js';

jest.mock('@ghostfolio/api/app/portfolio/current-rate.service', () => {
  return {
    CurrentRateService: jest.fn().mockImplementation(() => {
      return CurrentRateServiceMock;
    })
  };
});

jest.mock(
  '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service',
  () => {
    return {
      PortfolioSnapshotService: jest.fn().mockImplementation(() => {
        return PortfolioSnapshotServiceMock;
      })
    };
  }
);

jest.mock('@ghostfolio/api/app/redis-cache/redis-cache.service', () => {
  return {
    RedisCacheService: jest.fn().mockImplementation(() => {
      return RedisCacheServiceMock;
    })
  };
});

describe('PortfolioCalculator', () => {
  let configurationService: ConfigurationService;
  let currentRateService: CurrentRateService;
  let exchangeRateDataService: ExchangeRateDataService;
  let portfolioCalculatorFactory: PortfolioCalculatorFactory;
  let portfolioSnapshotService: PortfolioSnapshotService;
  let redisCacheService: RedisCacheService;

  beforeEach(() => {
    RedisCacheServiceMock.cache.clear();
    PortfolioSnapshotServiceMock.jobsStore.clear();

    configurationService = new ConfigurationService();

    currentRateService = new CurrentRateService(null, null, null, null);

    exchangeRateDataService = new ExchangeRateDataService(
      null,
      null,
      null,
      null
    );

    portfolioSnapshotService = new PortfolioSnapshotService(null, null);

    redisCacheService = new RedisCacheService(null, null);

    portfolioCalculatorFactory = new PortfolioCalculatorFactory(
      configurationService,
      currentRateService,
      exchangeRateDataService,
      portfolioSnapshotService,
      redisCacheService
    );
  });

  const cacheExpiredPortfolioSnapshot = (filters: Filter[]) => {
    RedisCacheServiceMock.cache.set(
      RedisCacheServiceMock.getPortfolioSnapshotKey({
        calculationType: PerformanceCalculationType.ROAI,
        filters,
        userCurrency: 'CHF',
        userId: userDummyData.id
      }),
      JSON.stringify({
        expiration: 0,
        portfolioSnapshot: {}
      })
    );
  };

  describe('portfolio snapshot job ids', () => {
    it('uses different job ids for different filters of the same user', async () => {
      const accountFilter = [{ id: 'account-1', type: 'ACCOUNT' }] as Filter[];
      const tagFilter = [{ id: 'tag-1', type: 'TAG' }] as Filter[];

      cacheExpiredPortfolioSnapshot(accountFilter);

      const accountPortfolioCalculator =
        portfolioCalculatorFactory.createCalculator({
          activities: [],
          calculationType: PerformanceCalculationType.ROAI,
          currency: 'CHF',
          filters: accountFilter,
          userId: userDummyData.id
        });

      await accountPortfolioCalculator.getSnapshot();

      const accountJobIds = [...PortfolioSnapshotServiceMock.jobsStore.keys()];

      PortfolioSnapshotServiceMock.jobsStore.clear();

      cacheExpiredPortfolioSnapshot(tagFilter);

      const tagPortfolioCalculator =
        portfolioCalculatorFactory.createCalculator({
          activities: [],
          calculationType: PerformanceCalculationType.ROAI,
          currency: 'CHF',
          filters: tagFilter,
          userId: userDummyData.id
        });

      await tagPortfolioCalculator.getSnapshot();

      const tagJobIds = [...PortfolioSnapshotServiceMock.jobsStore.keys()];

      expect(accountJobIds).toHaveLength(1);
      expect(tagJobIds).toHaveLength(1);
      expect(accountJobIds[0]).not.toBe(tagJobIds[0]);
    });

    it('uses the same job id for equivalent filters in a different order', async () => {
      const filters = [
        { id: 'tag-1', type: 'TAG' },
        { id: 'account-1', type: 'ACCOUNT' }
      ] as Filter[];

      cacheExpiredPortfolioSnapshot(filters);

      const portfolioCalculator = portfolioCalculatorFactory.createCalculator({
        activities: [],
        calculationType: PerformanceCalculationType.ROAI,
        currency: 'CHF',
        filters,
        userId: userDummyData.id
      });

      await portfolioCalculator.getSnapshot();

      const jobIds = [...PortfolioSnapshotServiceMock.jobsStore.keys()];

      PortfolioSnapshotServiceMock.jobsStore.clear();

      cacheExpiredPortfolioSnapshot([...filters].reverse());

      const reversedPortfolioCalculator =
        portfolioCalculatorFactory.createCalculator({
          activities: [],
          calculationType: PerformanceCalculationType.ROAI,
          currency: 'CHF',
          filters: [...filters].reverse(),
          userId: userDummyData.id
        });

      await reversedPortfolioCalculator.getSnapshot();

      const reversedJobIds = [...PortfolioSnapshotServiceMock.jobsStore.keys()];

      expect(jobIds).toHaveLength(1);
      expect(reversedJobIds).toHaveLength(1);
      expect(jobIds[0]).toBe(reversedJobIds[0]);
    });
  });

  describe('get current positions', () => {
    it('with no orders', async () => {
      jest.useFakeTimers().setSystemTime(parseDate('2021-12-18').getTime());

      const portfolioCalculator = portfolioCalculatorFactory.createCalculator({
        activities: [],
        calculationType: PerformanceCalculationType.ROAI,
        currency: 'CHF',
        userId: userDummyData.id
      });

      const portfolioSnapshot = await portfolioCalculator.computeSnapshot();

      const investments = portfolioCalculator.getInvestments();

      const investmentsByMonth = portfolioCalculator.getInvestmentsByGroup({
        data: portfolioSnapshot.historicalData,
        groupBy: 'month'
      });

      const investmentsByYear = portfolioCalculator.getInvestmentsByGroup({
        data: portfolioSnapshot.historicalData,
        groupBy: 'year'
      });

      expect(portfolioSnapshot).toMatchObject({
        currentValueInBaseCurrency: new Big(0),
        hasErrors: false,
        historicalData: [],
        positions: [],
        totalFeesWithCurrencyEffect: new Big('0'),
        totalInterestWithCurrencyEffect: new Big('0'),
        totalInvestment: new Big(0),
        totalInvestmentWithCurrencyEffect: new Big(0),
        totalLiabilitiesWithCurrencyEffect: new Big('0')
      });

      expect(investments).toEqual([]);

      expect(investmentsByMonth).toEqual([]);

      expect(investmentsByYear).toEqual([]);
    });
  });
});
