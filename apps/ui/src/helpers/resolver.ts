import { isAddress } from '@ethersproject/address';
import { ENSChainId, resolveName as resolveEnsName } from '@/helpers/ens';
import { memoize } from '@/helpers/utils';
import { NetworkID } from '@/types';

const ENS_CHAIN_IDS: Partial<Record<NetworkID, ENSChainId>> = {
  eth: 1,
  sep: 11155111
};

type ResolvedName = {
  networkId: NetworkID;
  address: string;
};

function createResolver() {
  async function resolveEns(
    networkId: NetworkID,
    name: string
  ): Promise<ResolvedName | null> {
    const chainId = ENS_CHAIN_IDS[networkId]!;
    const resolvedAddress = await resolveEnsName(name, chainId);

    if (!resolvedAddress) {
      return null;
    }

    return {
      networkId,
      address: resolvedAddress.toLowerCase()
    };
  }

  async function resolveName(
    name: string,
    networkId: NetworkID = 'eth'
  ): Promise<ResolvedName | null> {
    if (isAddress(name)) {
      return { networkId, address: name };
    }

    if (!ENS_CHAIN_IDS[networkId]) {
      return { networkId, address: name };
    }

    return resolveEns(networkId, name);
  }

  return {
    resolveEns: memoize(resolveEns),
    resolveName: memoize(resolveName)
  };
}

export const resolver = createResolver();
