// @ensdomains/ethers-patch-v5@0.0.5 calls
//   Object.defineProperties(utils, { dnsEncode, namehash, ensNormalize })
// at module-eval time. ethers v5.4+ already exports `dnsEncode` and `namehash`
// from `utils` as non-configurable getters, so the redefine throws and aborts
// the patch before the BaseProvider prototype overrides take effect.
// Intercept the first call, drop conflicting keys, then restore the global.

const original = Object.defineProperties;
Object.defineProperties = function patched(
  target: object,
  descriptors: PropertyDescriptorMap & ThisType<object>
) {
  Object.defineProperties = original;
  if (descriptors && typeof descriptors === 'object') {
    const filtered: PropertyDescriptorMap = {};
    for (const key of Object.keys(descriptors)) {
      const existing = Object.getOwnPropertyDescriptor(target, key);
      if (existing && !existing.configurable) continue;
      filtered[key] = descriptors[key];
    }
    descriptors = filtered as PropertyDescriptorMap & ThisType<object>;
  }
  return original.call(Object, target, descriptors);
} as typeof Object.defineProperties;
