import { AccountWithPlatform } from '@ghostfolio/common/types';

export function getAccountLabel(account: AccountWithPlatform) {
  return account.platform?.name
    ? `${account.platform.name} - ${account.name}`
    : account.name;
}
