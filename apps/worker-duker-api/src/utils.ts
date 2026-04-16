import { fromBytes, hexToBytes } from "viem";

export function stringify(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, space);
}

const noiseValue = /^-?\d+n+$/; // Noise - strings that match the custom format before being converted to it
const originalStringify = JSON.stringify;
const originalParse = JSON.parse;

/*
  Function to serialize value to a JSON string.
  Converts BigInt values to a custom format (strings with digits and "n" at the end) and then converts them to proper big integers in a JSON string.
*/
export const JSONStringify = (
  value: any,
  replacer?: ((this: any, key: string, value: any) => any) | (number | string)[] | null,
  space?: string | number
): string => {
  if ("rawJSON" in JSON) {
    return originalStringify(
      value,
      (key: string, val: any) => {
        if (typeof val === "bigint") return (JSON as any).rawJSON(val.toString());

        if (typeof replacer === "function") return replacer(key, val);

        if (Array.isArray(replacer) && replacer.includes(key as (string | number))) return val;

        return val;
      },
      space
    );
  }

  if (!value) {
    if (typeof replacer === 'function') {
      return originalStringify(value, replacer, space);
    } else {
      // replacer is (number | string)[] | null | undefined
      return originalStringify(value, replacer, space);
    }
  }

  const bigInts = /([\[:])?"(-?\d+)n"($|([\\n]|\s)*(\s|[\\n])*[,\}\]])/g;
  const noise = /([\[:])?("-?\d+n+)n("$|"([\\n]|\s)*(\s|[\\n])*[,\}\]])/g;
  const convertedToCustomJSON = originalStringify(
    value,
    (key: string, val: any) => {
      const isNoise =
        typeof val === "string" && Boolean(val.match(noiseValue));

      if (isNoise) return val.toString() + "n"; // Mark noise values with additional "n" to offset the deletion of one "n" during the processing

      if (typeof val === "bigint") return val.toString() + "n";

      if (typeof replacer === "function") return replacer(key, val);

      if (Array.isArray(replacer) && replacer.includes(key as (string | number))) return val;

      return val;
    },
    space
  );
  const processedJSON = convertedToCustomJSON.replace(bigInts, "$1$2$3"); // Delete one "n" off the end of every BigInt value
  const denoisedJSON = processedJSON.replace(noise, "$1$2$3"); // Remove one "n" off the end of every noisy string

  return denoisedJSON;
}

/*
  Function to parse JSON.
  If JSON has number values greater than Number.MAX_SAFE_INTEGER, we convert those values to a custom format, then parse them to BigInt values.
  Other types of values are not affected and parsed as native JSON.parse() would parse them.
*/
export const JSONParse = (
  text: string,
  reviver?: (this: any, key: string, value: any) => any
): any => {
  if (!text) return originalParse(text, reviver);

  const MAX_INT = Number.MAX_SAFE_INTEGER.toString();
  const MAX_DIGITS = MAX_INT.length;
  const stringsOrLargeNumbers =
    /"(?:\\.|[^"])*"|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/g;
  const noiseValueWithQuotes = /^"-?\d+n+"$/; // Noise - strings that match the custom format before being converted to it
  const customFormat = /^-?\d+n$/;

  // Find and mark big numbers with "n"
  const serializedData = text.replace(
    stringsOrLargeNumbers,
    (match: string, digits?: string, fractional?: string, exponential?: string): string => {
      const isString = match[0] === '"';
      const isNoise = isString && Boolean(match.match(noiseValueWithQuotes));

      if (isNoise) return match.substring(0, match.length - 1) + 'n"'; // Mark noise values with additional "n" to offset the deletion of one "n" during the processing

      const isFractionalOrExponential = fractional || exponential;
      const isLessThanMaxSafeInt =
        digits &&
        (digits.length < MAX_DIGITS ||
          (digits.length === MAX_DIGITS && digits <= MAX_INT)); // With a fixed number of digits, we can correctly use lexicographical comparison to do a numeric comparison

      if (isString || isFractionalOrExponential || isLessThanMaxSafeInt)
        return match;

      return '"' + match + 'n"';
    }
  );

  // Convert marked big numbers to BigInt
  return originalParse(serializedData, (key: string, value: any) => {
    const isCustomFormatBigInt =
      typeof value === "string" && Boolean(value.match(customFormat));

    if (isCustomFormatBigInt)
      return BigInt(value.substring(0, value.length - 1));

    const isNoiseValue =
      typeof value === "string" && Boolean(value.match(noiseValue));

    if (isNoiseValue) return value.substring(0, value.length - 1); // Remove one "n" off the end of the noisy string

    if (typeof reviver !== "function") return value;

    return reviver.call(null, key, value);
  });
};

const ETH_NONCE_IN_SIWE_PATTERN = /Nonce: (?<nonce>[a-zA-Z0-9]+)/u

export function getNonceFromMessage(message: string) {
  return message.match(ETH_NONCE_IN_SIWE_PATTERN)?.[1] || ''
}