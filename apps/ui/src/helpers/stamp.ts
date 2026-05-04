import { ensNormalize } from '@ethersproject/hash';
import { ChainId } from '@/types';
import { getProvider } from './provider';
import { formatAddress } from './utils';

const resolvedAddresses = new Map<string, string | null>();
const resolvedNames = new Map<string, string | null>();

const STAMP_URL = 'https://stamp.fyi';

const SKIP_LIST = ['shawnpetersisastupidnigger.eth'];

export async function getAddresses(
  names: string[],
  chainId: ChainId
): Promise<Record<string, string>> {
  try {
    const inputMapping = Object.fromEntries(
      names.map(name => [name, ensNormalize(name)])
    );
    const unresolvedNames = Array.from(
      new Set(
        Object.values(inputMapping).filter(name => !resolvedNames.has(name))
      )
    );

    if (unresolvedNames.length > 0) {
      const provider = getProvider(Number(chainId));
      const results = await Promise.all(
        unresolvedNames.map(name =>
          provider.resolveName(name).catch(() => null)
        )
      );
      unresolvedNames.forEach((name, i) => {
        resolvedNames.set(name, results[i] ?? null);
      });
    }

    const entries = Object.entries(inputMapping)
      .map(([name, formatted]) => [name, resolvedNames.get(formatted)])
      .filter(([, address]) => address);

    return Object.fromEntries(entries);
  } catch (err) {
    console.error('Failed to lookup addresses', err);
    return {};
  }
}

export async function getNames(
  addresses: string[]
): Promise<Record<string, string>> {
  try {
    const inputMapping = Object.fromEntries(
      addresses.map(address => [address, formatAddress(address)])
    );
    const unresolvedAddresses = Array.from(
      new Set(
        Object.values(inputMapping).filter(
          address => !resolvedAddresses.has(address)
        )
      )
    );

    if (unresolvedAddresses.length > 0) {
      const provider = getProvider(1);
      const results = await Promise.all(
        unresolvedAddresses.map(address =>
          provider.lookupAddress(address).catch(() => null)
        )
      );
      unresolvedAddresses.forEach((address, i) => {
        resolvedAddresses.set(address, results[i] ?? null);
      });
    }

    const entries: any = Object.entries(inputMapping)
      .map(([address, formatted]) => {
        let name = resolvedAddresses.get(formatted);
        if (name && SKIP_LIST.includes(name)) {
          name = null;
        }
        return [address, name];
      })
      .filter(([, name]) => name);

    return Object.fromEntries(entries);
  } catch (err) {
    console.error('Failed to resolve names', err);
    return {};
  }
}

// The Universal Resolver does not expose name enumeration (one address ->
// list of names owned), so this still hits Snapshot's stamp.fyi indexer.
export async function getENSNames(
  address: string,
  chainIds: ChainId[]
): Promise<string[]> {
  const res = await fetch(STAMP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      method: 'lookup_domains',
      params: formatAddress(address),
      network: chainIds
    })
  });

  if (res.status !== 200) {
    throw new Error('Failed to get domains');
  }

  return (await res.json()).result;
}

// Used for non-ENS namespaces (currently .shib via Shibarium); not ENS resolution.
export async function getOwner(
  name: string,
  chainId: ChainId
): Promise<string> {
  const res = await fetch(STAMP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      method: 'get_owner',
      params: name,
      network: chainId
    })
  });

  if (res.status !== 200) {
    throw new Error('Failed to get owner');
  }

  return (await res.json()).result;
}
