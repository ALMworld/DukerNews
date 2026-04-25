/**
 * Protobuf serialization adapter for TanStack Start SSR.
 *
 * Binary TLV frame: [1 byte: typeName length][N bytes: typeName ASCII][remaining: proto binary]
 * The entire frame is base64-encoded for JSON transport.
 */

import { createSerializationAdapter } from '@tanstack/react-router'
import { toBinary, fromBinary, type Message } from '@bufbuild/protobuf'
import { base64Encode, base64Decode } from '@bufbuild/protobuf/wire'
import { registry } from '@repo/dukernews-apidefs'

export const protoAdapter = createSerializationAdapter<Message, string>({
    key: 'custom',
    test: (v): v is Message =>
        v != null && typeof v === 'object' && '$typeName' in v,
    toSerializable: (msg) => {
        const schema = registry.getMessage(msg.$typeName)
        if (!schema) {
            throw new Error(`[protoAdapter] Unknown proto type: ${msg.$typeName}`)
        }
        const data = toBinary(schema, msg)
        const name = msg.$typeName
        // TLV: [1 byte len][typeName ASCII][proto data]
        const frame = new Uint8Array(1 + name.length + data.length)
        frame[0] = name.length
        for (let i = 0; i < name.length; i++) {
            frame[1 + i] = name.charCodeAt(i)
        }
        frame.set(data, 1 + name.length)
        return base64Encode(frame)
    },
    fromSerializable: (b64) => {
        const frame = base64Decode(b64)
        const nameLen = frame[0]
        let typeName = ''
        for (let i = 0; i < nameLen; i++) {
            typeName += String.fromCharCode(frame[1 + i])
        }
        const data = frame.subarray(1 + nameLen)
        const schema = registry.getMessage(typeName)
        if (!schema) {
            throw new Error(`[protoAdapter] Unknown proto type during decode: ${typeName}`)
        }
        return fromBinary(schema, data)
    },
})
