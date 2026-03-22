// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as PostService from '../../services/post-service'
// import { PostKind } from '@repo/apidefs'
//
// export const Route = createFileRoute('/api/posts')({
//     server: {
//         handlers: {
//             GET: async ({ request }) => {
//                 const url = new URL(request.url)
//                 const kindStr = url.searchParams.get('kind')
//                 const input = {
//                     kind: kindStr === 'works' ? PostKind.WORKS : kindStr === 'voice' ? PostKind.VOICE : undefined,
//                     page: Number(url.searchParams.get('page')) || undefined,
//                     perPage: Number(url.searchParams.get('perPage')) || undefined,
//                     sort: (url.searchParams.get('sort') as 'points' | 'newest') || undefined,
//                     q: url.searchParams.get('q') || undefined,
//                     nextCursor: Number(url.searchParams.get('nextCursor')) || undefined,
//                     address: url.searchParams.get('address') || undefined,
//                 }
//                 const result = await PostService.getPosts(input)
//                 return Response.json(result)
//             },
//             POST: async ({ request }) => {
//                 try {
//                     const body = await request.json() as any
//                     const post = await PostService.createPost(body)
//                     return Response.json(post, { status: 201 })
//                 } catch (err: any) {
//                     return Response.json({ error: err.message, stack: err.stack }, { status: 500 })
//                 }
//             },
//         },
//     },
// })
