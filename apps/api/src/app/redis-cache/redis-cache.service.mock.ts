import { Filter } from '@ghostfolio/common/interfaces';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { createHash } from 'node:crypto';

export const RedisCacheServiceMock = {
  cache: new Map<string, string>(),
  get: (key: string): Promise<string> => {
    const value = RedisCacheServiceMock.cache.get(key) || null;

    return Promise.resolve(value);
  },
  getPortfolioSnapshotKey: ({
    calculationType,
    filters,
    userCurrency,
    userId
  }: {
    calculationType?: PerformanceCalculationType;
    filters?: Filter[];
    userCurrency?: string;
    userId: string;
  }): string => {
    let portfolioSnapshotKey = `portfolio-snapshot-${userId}`;

    if (calculationType && userCurrency) {
      portfolioSnapshotKey = `${portfolioSnapshotKey}-${calculationType}-${userCurrency}`;
    }

    if (filters?.length > 0) {
      const canonicalFilters = [...filters].sort((a, b) => {
        return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
      });

      const filtersHash = createHash('sha256')
        .update(JSON.stringify(canonicalFilters))
        .digest('hex');

      portfolioSnapshotKey = `${portfolioSnapshotKey}-${filtersHash}`;
    }

    return portfolioSnapshotKey;
  },
  set: (key: string, value: string): Promise<string> => {
    RedisCacheServiceMock.cache.set(key, value);

    return Promise.resolve(value);
  }
};
