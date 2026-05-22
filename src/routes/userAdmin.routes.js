import { listUsers, updateUserRole } from '../controllers/userAdmin.controller.js';

export const userAdminRoutes = [
    {
        method: 'GET',
        path: '/api/admin/users',
        auth: { required: true, roles: ['admin'] },
        handler: listUsers,
    },
    {
        method: 'PATCH',
        path: '/api/admin/users/:userId/role',
        auth: { required: true, roles: ['admin'] },
        handler: updateUserRole,
    },
];
