import { DividendDetail, Order, SymbolProfile, Tag } from '@prisma/client';

import { AccountWithPlatform } from './account-with-platform.type';

export type OrderWithAccount = Order & {
  account?: AccountWithPlatform;
  dividendDetail?: DividendDetail | null;
  SymbolProfile?: SymbolProfile;
  tags?: Tag[];
};
