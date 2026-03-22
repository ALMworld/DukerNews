// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as PostService from '../../../services/post-service'
//
// export const Route = createFileRoute('/api/posts/$id')({
//     server: {
//         handlers: {
//             GET: async ({ params }) => {
//                 const post = await PostService.getPost(Number(params.id))
//                 if (!post) {
//                     return new Response('Not found', { status: 404 })
//                 }
//                 return Response.json(post)
//             },
//         },
//     },
// })
