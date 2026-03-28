/**
 * Zero-dependency deflate-raw compression/decompression.
 * Uses native CompressionStream/DecompressionStream API
 * (available in modern browsers + Cloudflare Workers).
 */

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
    return streamToBytes(
        new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    )
}

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    return streamToBytes(
        new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    )
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
    }
    const len = chunks.reduce((s, c) => s + c.length, 0)
    const result = new Uint8Array(len)
    let offset = 0
    for (const c of chunks) { result.set(c, offset); offset += c.length }
    return result
}
