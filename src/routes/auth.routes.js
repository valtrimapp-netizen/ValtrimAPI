// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import {
    login,
    register,
} from '../controllers/auth.controller.js';

export const authRoutes = [
    {
        method: 'POST',
        path: '/api/auth/register',
        handler: register,
    },
    {
        method: 'POST',
        path: '/api/auth/login',
        handler: login,
    },
];
