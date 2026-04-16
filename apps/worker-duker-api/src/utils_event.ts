import { create, fromBinary } from '@bufbuild/protobuf'
import { Uint128, Uint128Schema } from '@repo/apidefs';
import { fromBytes, hexToBytes, toHex } from 'viem'
export function bigintToUint128(value: bigint): Uint128 {

  return create(Uint128Schema, {
    lo: value & 0xFFFFFFFFFFFFFFFFn,
    hi: value >> 64n
  })
}

export function n0x(hex: string | null | undefined): string {
  // Return an empty string for null, undefined, or empty inputs
  if (!hex) {
    return '';
  }

  // Check for '0x' or '0X' at the beginning of the string
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    // Return the rest of the string after the prefix
    return hex.slice(2);
  }

  // If no prefix is found, return the original string
  return hex;
}

export function bytes32ToHexString(bytes32: `0x${string}`): string {
  const bytes = hexToBytes(bytes32);
  let lastIndex = bytes.length - 1;
  while (lastIndex >= 0 && bytes[lastIndex] === 0) {
    lastIndex--;
  }
  const slicedBytes = bytes.slice(0, lastIndex + 1);
  // toHex returns a hex string with a '0x' prefix. We slice it off to match the original format.
  return toHex(slicedBytes).slice(2);
}

export function hexToUint8Array(hex: string): Uint8Array {
  return hexToBytes(hex as `0x${string}`)
}

export function ensureUint8Array(data: any): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data)) {
    return new Uint8Array(data);
  }

  if (typeof data === 'string') {
    // If it's a hex string
    if (data.startsWith('0x')) {
      return hexToBytes(data as `0x${string}`);
    }
    // If it's a base64 string
    try {
      return new Uint8Array(atob(data).split('').map(c => c.charCodeAt(0)));
    } catch {
      // If it's a regular string, convert to bytes
      return new TextEncoder().encode(data);
    }
  }

  // Last resort: try to create from whatever we have
  try {
    return new Uint8Array(data);
  } catch (error) {
    console.error('Failed to convert data to Uint8Array:', data, error);
    return new Uint8Array(0);
  }
}

// export function mapEventType(evolveDaoEventType: number): EventType {
//   /**
//      * Map contract EvolveDaoEventType enum to protobuf EventType
//      */
//   switch (evolveDaoEventType) {
//     case 0: // BAGUA_ROLE_ADDED
//       return EventType.BAGUA_EVOLVE_DAO_BORN
//     case 1: // BEING_KINDNESS_FIRST_COMMIT
//       return EventType.DAO_EGO_KINDNESS_FIRST_COMMIT
//     case 2: // BEING_KINDNESS_FIRST_JUDGE
//       return EventType.DAO_EGO_KINDNESS_FIRST_JUDGE
//     case 3: // KINDNESS_FIRST_INVESTMENT
//       return EventType.DAO_EGO_KINDNESS_FIRST_INVESTMENT
//     case 4: // FAIRNESS_ALWAYS_CLAIM
//       return EventType.DAO_EGO_FAIRNESS_ALWAYS_CLAIM
//     case 5: // DAO_EVOLUTION_WILLING
//       return EventType.DAO_WORLD_EVOLUTION_WILLING
//     case 6: // DAO_EVOLUTION_MANIFESTATION
//       return EventType.DAO_WORLD_EVOLUTION_MANIFESTATION
//     case 7: // BAGUA_DUKI_DAO_BPS_CHANGED
//       return EventType.DAO_DUKI_DAO_BPS_CHANGED
//     case 8: // BAGUA_ROLE_ADDED
//       return EventType.DAO_BAGUA_ROLE_ADDED
//     default:
//       console.warn(`Unknown EvolveDaoEventType: ${evolveDaoEventType}`)
//       return EventType.EVOLVE_UNKNOWN
//   }
// }

// export function mapBaguaRole(value: number): BaguaRole {
//   switch (value) {
//     case 0: return BaguaRole.Earth_Kun_0_ALM_World;
//     case 1: return BaguaRole.Mountain_Gen_1_ALM_Nation;
//     case 2: return BaguaRole.Water_Kan_2_Investors;
//     case 3: return BaguaRole.Wind_Xun_3_Community;
//     case 4: return BaguaRole.Thunder_Zhen_4_Marketers;
//     case 5: return BaguaRole.Fire_Li_5_Partners;
//     case 6: return BaguaRole.Lake_Dui_6_Builders;
//     case 7: return BaguaRole.Heaven_Qian_7_Founders;
//     default:
//       console.warn(`Unknown BaguaRole: ${value}`)
//       throw new Error(`Unknown BaguaRole: ${value}`);
//   }
// }



