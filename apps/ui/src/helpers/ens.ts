import { Signer } from '@ethersproject/abstract-signer';
import { getAddress, isAddress } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
import { ensNormalize, namehash } from '@ethersproject/hash';
import { call } from './call';
import { EVM_EMPTY_ADDRESS } from './constants';
import { getProvider } from './provider';

export type ENSChainId = 1 | 11155111;

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const ENS_REGISTRY_ABI = [
  'function owner(bytes32) view returns (address)',
  'function resolver(bytes32 node) view returns (address)'
];
const RESOLVER_WRITE_ABI = [
  'function setText(bytes32 node, string key, string value)'
];
const NAME_WRAPPER_ABI = ['function ownerOf(uint256) view returns (address)'];

const NAME_WRAPPERS: Record<ENSChainId, string> = {
  1: '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401',
  11155111: '0x0635513f179D50A207757E05759CbD106d7dFcE8'
};

const SUPPORTED_CHAIN_IDS: readonly ENSChainId[] = [1, 11155111];

function assertSupportedChainId(
  chainId: number
): asserts chainId is ENSChainId {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as ENSChainId)) {
    throw new Error('Unsupported chainId');
  }
}

// see https://docs.ens.domains/registry/dns#gasless-import
async function getDNSOwner(domain: string): Promise<string> {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`,
    {
      headers: {
        accept: 'application/dns-json'
      }
    }
  );

  if (!response.ok) throw new Error('Failed to fetch DNS Owner');

  const data = await response.json();
  // Error list: https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-6
  if (data.Status === 3) return EVM_EMPTY_ADDRESS;
  if (data.Status !== 0) throw new Error('Failed to fetch DNS Owner');

  const ownerRecord = data.Answer?.find((record: any) =>
    record.data.includes('ENS1')
  );

  if (!ownerRecord) return EVM_EMPTY_ADDRESS;

  return getAddress(
    ownerRecord.data.replace(new RegExp('"', 'g'), '').split(' ').pop()
  );
}

export async function resolveName(name: string, chainId: ENSChainId) {
  assertSupportedChainId(chainId);
  const provider = getProvider(chainId);
  try {
    const address = await provider.resolveName(name);
    return address && address !== EVM_EMPTY_ADDRESS ? address : null;
  } catch {
    return null;
  }
}

export async function getEnsTextRecord(
  ens: string,
  record: string,
  chainId: ENSChainId
) {
  assertSupportedChainId(chainId);

  let normalized: string;
  try {
    normalized = ensNormalize(ens);
  } catch {
    return null;
  }

  const provider = getProvider(chainId);
  const resolver = await provider.getResolver(normalized);
  if (!resolver) return null;

  return resolver.getText(record);
}

export async function setEnsTextRecord(
  signer: Signer,
  ens: string,
  record: string,
  value: string,
  chainId: ENSChainId
) {
  assertSupportedChainId(chainId);

  const ensHash = namehash(ensNormalize(ens));

  const resolverAddress = await call(getProvider(chainId), ENS_REGISTRY_ABI, [
    ENS_REGISTRY,
    'resolver',
    [ensHash]
  ]);

  if (!resolverAddress || resolverAddress === EVM_EMPTY_ADDRESS) {
    throw new Error('No resolver set for this name');
  }

  const contract = new Contract(resolverAddress, RESOLVER_WRITE_ABI, signer);

  return contract.setText(ensHash, record, value);
}

export async function getNameOwner(name: string, chainId: ENSChainId) {
  assertSupportedChainId(chainId);
  const provider = getProvider(chainId);
  const ensHash = namehash(name);

  let owner = await call(
    provider,
    ENS_REGISTRY_ABI,
    [ENS_REGISTRY, 'owner', [ensHash]],
    {
      blockTag: 'latest'
    }
  );

  if (!name.endsWith('.eth') && owner === EVM_EMPTY_ADDRESS) {
    const resolvedAddress = await resolveName(name, chainId);
    const nameTokens = name.split('.');

    if (nameTokens.length > 2) {
      owner = resolvedAddress || EVM_EMPTY_ADDRESS;
    } else if (nameTokens.length === 2 && resolvedAddress) {
      owner = await getDNSOwner(name);
    }
  }

  if (owner !== NAME_WRAPPERS[chainId]) return owner;

  return call(
    provider,
    NAME_WRAPPER_ABI,
    [NAME_WRAPPERS[chainId], 'ownerOf', [ensHash]],
    {
      blockTag: 'latest'
    }
  );
}

export async function getSpaceController(name: string, chainId: ENSChainId) {
  const snapshotRecord = await getEnsTextRecord(name, 'snapshot', chainId);
  if (snapshotRecord) {
    if (isAddress(snapshotRecord)) return snapshotRecord;

    const uriParts = snapshotRecord.split('/');
    const position = uriParts.includes('testnet') ? 5 : 4;
    const address = uriParts[position];
    if (isAddress(address)) return address;
  }

  return getNameOwner(name, chainId);
}
