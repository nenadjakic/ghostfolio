import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { Filter } from '@ghostfolio/common/interfaces';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

describe('RedisCacheService', () => {
  const redisCacheService = Object.create(
    RedisCacheService.prototype
  ) as RedisCacheService;

  describe('getPortfolioSnapshotKey', () => {
    it('includes the user id, calculation type, and user currency without filters', () => {
      expect(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      ).toBe('portfolio-snapshot-user-1-ROAI-CHF');
    });

    it('returns the same key for equivalent filters in a different order', () => {
      const filters = [
        { id: 'tag-1', type: 'TAG' },
        { id: 'account-1', type: 'ACCOUNT' }
      ] as Filter[];
      const reversedFilters = [...filters].reverse();

      expect(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          filters,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      ).toBe(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          filters: reversedFilters,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      );
    });

    it('returns different keys for different filters', () => {
      const accountFilter = [{ id: 'account-1', type: 'ACCOUNT' }] as Filter[];
      const tagFilter = [{ id: 'tag-1', type: 'TAG' }] as Filter[];

      expect(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          filters: accountFilter,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      ).not.toBe(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          filters: tagFilter,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      );
    });

    it('returns different keys for different calculation types', () => {
      expect(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      ).not.toBe(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.TWR,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      );
    });

    it('returns different keys for different user currencies', () => {
      expect(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          userCurrency: 'CHF',
          userId: 'user-1'
        })
      ).not.toBe(
        redisCacheService.getPortfolioSnapshotKey({
          calculationType: PerformanceCalculationType.ROAI,
          userCurrency: 'USD',
          userId: 'user-1'
        })
      );
    });
  });
});
