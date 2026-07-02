import Link from "next/link";
import { Button, Input, Label } from "@telepace/ui";
import { Nav, Footer } from "@/components/site-chrome";

export const metadata = { title: "Log in · telepace" };

export default function LoginPage() {
  return (
    <>
      <Nav />
      <section className="min-h-[calc(100vh-4rem-24rem)] flex items-center py-20">
        <div className="container-content grid md:grid-cols-12 items-center gap-10">
          <div className="md:col-span-6">
            <p className="overline mb-4">Welcome back</p>
            <h1 className="font-display text-[clamp(2.5rem,4.5vw,3.75rem)] leading-tight">
              Sign in to <span className="italic text-accent">telepace.</span>
            </h1>
            <p className="mt-6 text-body text-lg max-w-md">
              Studies you've drafted, interviews mid-flight, insights waiting — all right where you left them.
            </p>
          </div>

          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper-elevated p-8 max-w-md md:ml-auto">
              <div className="space-y-3">
                <Button variant="secondary" className="w-full h-11">
                  <span>Continue with Google</span>
                </Button>
                <Button variant="secondary" className="w-full h-11">
                  <span>Continue with GitHub</span>
                </Button>
              </div>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-hairline" />
                <span className="text-xs text-muted uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-hairline" />
              </div>

              <form className="space-y-4">
                <div>
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" required />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password">Password</Label>
                    <Link href="/forgot" className="text-xs text-accent">Forgot?</Link>
                  </div>
                  <Input id="password" type="password" required />
                </div>
                <Button className="w-full h-11" type="submit">Log in</Button>
              </form>

              <p className="mt-6 text-sm text-muted text-center">
                Don't have an account? <Link href="/signup" className="text-accent">Sign up →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
