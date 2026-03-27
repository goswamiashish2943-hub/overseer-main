// packages/dashboard/app/page.jsx
// Root page — redirects straight to /dashboard for now
// (Auth/login page will be added in a later checkpoint)

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
