// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as CommentService from '../../../../services/comment-service'
//
// export const Route = createFileRoute('/api/posts/$id/comments')({
//     server: {
//         handlers: {
//             GET: async ({ params }) => {
//                 const comments = await CommentService.getComments(Number(params.id))
//                 return Response.json(comments)
//             },
//             POST: async ({ request, params }) => {
//                 const body = await request.json() as any
//                 const comment = await CommentService.addComment({
//                     postId: Number(params.id),
//                     parentId: body.parentId ?? null,
//                     text: body.text,
//                     locale: body.locale ?? 'en',
//                     address: body.address,
//                     username: body.username,
//                 })
//                 return Response.json(comment, { status: 201 })
//             },
//         },
//     },
// })
