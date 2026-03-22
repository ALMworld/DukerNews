// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as PostService from '../../../../services/post-service'
//
// export const Route = createFileRoute('/api/posts/$id/vote')({
//     server: {
//         handlers: {
//             POST: async ({ request, params }) => {
//                 const body = await request.json() as any
//                 const result = await PostService.upvotePost({
//                     postId: Number(params.id),
//                     address: body.address,
//                 })
//                 if (!result) {
//                     return Response.json({ error: 'Already voted or post not found' }, { status: 409 })
//                 }
//                 return Response.json(result)
//             },
//         },
//     },
// })
