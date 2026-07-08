import Link from "next/link";
import { Button } from "@telepace/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-6xl text-muted mb-4">404</p>
        <h1 className="font-display text-3xl">Page not found</h1>
        <p className="mt-3 text-body max-w-sm mx-auto">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/" className="inline-block mt-6">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}
