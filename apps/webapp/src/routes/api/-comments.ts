// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as CommentService from '../../services/comment-service'
//
// export const Route = createFileRoute('/api/comments')({
//     server: {
//         handlers: {
//             GET: async ({ request }) => {
//                 const url = new URL(request.url)
//                 const limit = Number(url.searchParams.get('limit')) || 40
//                 const comments = await CommentService.getRecentComments(limit)
//                 return Response.json(comments)
//             },
//         },
//     },
// })
