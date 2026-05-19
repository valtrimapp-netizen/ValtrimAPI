import {
    changePassword,
    forgotPassword,
    login,
    loginGoogle,
    logout,
    logoutAll,
    me,
    refresh,
    register,
    resetPassword,
    updateProfile,
    verifyPasswordResetCode,
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
    {
        method: 'POST',
        path: '/api/auth/google',
        handler: loginGoogle,
    },
    {
        method: 'POST',
        path: '/api/auth/refresh',
        handler: refresh,
    },
    {
        method: 'POST',
        path: '/api/auth/password/forgot',
        handler: forgotPassword,
    },
    {
        method: 'POST',
        path: '/api/auth/password/verify-otp',
        handler: verifyPasswordResetCode,
    },
    {
        method: 'POST',
        path: '/api/auth/password/reset',
        handler: resetPassword,
    },
    {
        method: 'GET',
        path: '/api/auth/me',
        auth: { required: true, permissionsAll: ['auth.self.read'] },
        handler: me,
    },
    {
        method: 'PATCH',
        path: '/api/auth/me',
        auth: { required: true, permissionsAll: ['auth.self.update'] },
        handler: updateProfile,
    },
    {
        method: 'POST',
        path: '/api/auth/me/password',
        auth: { required: true, permissionsAll: ['auth.self.update'] },
        handler: changePassword,
    },
    {
        method: 'POST',
        path: '/api/auth/logout',
        auth: { required: true, permissionsAll: ['auth.session.revoke'] },
        handler: logout,
    },
    {
        method: 'POST',
        path: '/api/auth/logout-all',
        auth: { required: true, permissionsAll: ['auth.session.revoke_all'] },
        handler: logoutAll,
    },
];
