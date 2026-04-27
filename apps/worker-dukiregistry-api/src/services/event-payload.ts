/**
 * event-payload.ts — Decode DukerEvent / DukigenEvent payloads using the
 * wagmi-generated `_ABI_<TypeName>` error helpers from contract-duki-alm-world.
 *
 * Each payload struct (e.g. ProfileUpdatedData) is exposed by the Solidity
 * interface as `error _ABI_ProfileUpdatedData(ProfileUpdatedData data)` so the
 * tuple type makes it into the ABI. We pull the tuple components out of the
 * generated ABI at runtime — keeps decoders in sync with the contract without
 * hand-maintaining tuple shapes.
 */

import { decodeAbiParameters, type AbiParameter } from 'viem'

type AbiItem = { type: string; name?: string; inputs?: readonly AbiParameter[] }

/**
 * Look up the tuple parameter for a payload type, e.g. 'ProfileUpdatedData'.
 * Returns null if the wagmi-generated ABI doesn't expose it (e.g. contract
 * artifacts haven't been rebuilt after a struct was added).
 */
function findPayloadAbi(
    abi: readonly AbiItem[],
    payloadName: string,
): readonly AbiParameter[] | null {
    const helper = abi.find(
        (item) => item.type === 'error' && item.name === `_ABI_${payloadName}`,
    )
    if (!helper || !helper.inputs || helper.inputs.length === 0) return null
    return helper.inputs
}

/**
 * Decode the bytes `eventData` of a DukerEvent / DukigenEvent into the named
 * payload struct. Returns null when the ABI helper is missing or decoding
 * fails — callers should treat that as "skip this event type for now".
 */
export function decodeEventPayload<T = Record<string, unknown>>(
    abi: readonly AbiItem[],
    payloadName: string,
    eventData: string,
): T | null {
    const params = findPayloadAbi(abi, payloadName)
    if (!params) return null
    try {
        const decoded = decodeAbiParameters(params, eventData as `0x${string}`)
        return decoded[0] as T
    } catch {
        return null
    }
}
