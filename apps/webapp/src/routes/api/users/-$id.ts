// @public-api — disabled (not used internally)
// Uncomment to expose as external REST API.
//
// import { createFileRoute } from '@tanstack/react-router'
// import * as UserService from '../../../services/user-service'
//
// export const Route = createFileRoute('/api/users/$id')({
//     server: {
//         handlers: {
//             GET: async ({ params }) => {
//                 const user = await UserService.getUser(params.id)
//                 if (!user) {
//                     return new Response('Not found', { status: 404 })
//                 }
//                 return Response.json(user)
//             },
//             PUT: async ({ request, params }) => {
//                 const body = await request.json() as any
//                 const updated = await UserService.updateUser({
//                     address: params.id,
//                     about: body.about,
//                     email: body.email,
//                 })
//                 if (!updated) {
//                     return new Response('Not found', { status: 404 })
//                 }
//                 return Response.json(updated)
//             },
//         },
//     },
// })
