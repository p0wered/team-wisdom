import { createBrowserRouter, Navigate } from 'react-router'
import { HomePage } from './pages/HomePage'

/**
 * Routes. `basename` follows Vite's `base`, so the app also works when served
 * from a sub-path (e.g. GitHub Pages: base: '/team-wisdom/').
 */
export const router = createBrowserRouter(
  [
    { path: '/', element: <HomePage /> },
    // No other pages yet: unknown addresses go home.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL },
)
