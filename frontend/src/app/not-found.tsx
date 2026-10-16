import { LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you are looking for does not exist or was moved.</p>
      <LinkButton href="/" className="mt-6">
        Back to home
      </LinkButton>
    </div>
  );
}
