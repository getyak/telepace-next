import Link from "next/link";
import { Button, Input, Label } from "@telepace/ui";
import { Nav, Footer } from "@/components/site-chrome";

export const metadata = { title: "Start free · telepace" };

const benefits = [
  "3 studies / month, on us",
  "10 completions per study",
  "Text + shareable link channels",
  "No card required — ever",
];

export default function SignupPage() {
  return (
    <>
      <Nav />
      <section className="min-h-[calc(100vh-4rem-24rem)] py-16 md:py-20">
        <div className="container-content grid md:grid-cols-12 gap-12">
          <div className="md:col-span-6 flex flex-col justify-center">
            <p className="overline mb-4">Start free</p>
            <h1 className="font-display text-[clamp(2.5rem,4.5vw,3.75rem)] leading-tight">
              Your first three interviews <span className="italic text-accent">are on us.</span>
            </h1>
            <p className="mt-6 text-body text-lg max-w-md">
              No card, no drip campaign, no sales call. Just the fastest way from a question to a hundred honest answers.
            </p>
            <ul className="mt-8 space-y-3 max-w-md">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-body">
                  <span className="text-accent mt-0.5">✓</span> {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-6">
            <div className="rounded-card border border-hairline bg-paper-elevated p-8 max-w-md md:ml-auto">
              <p className="overline mb-4">Create your workspace</p>

              <div className="space-y-3">
                <Button variant="secondary" className="w-full h-11">Sign up with Google</Button>
                <Button variant="secondary" className="w-full h-11">Sign up with GitHub</Button>
              </div>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-hairline" />
                <span className="text-xs text-muted uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-hairline" />
              </div>

              <form className="space-y-4">
                <div>
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" placeholder="Alex Kim" required />
                </div>
                <div>
                  <Label htmlFor="workspace">Workspace name</Label>
                  <Input id="workspace" placeholder="Acme Research" required />
                </div>
                <div>
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" required />
                </div>
                <div>
                  <Label htmlFor="password">Choose a password</Label>
                  <Input id="password" type="password" required />
                </div>
                <Button className="w-full h-11" type="submit">Create workspace →</Button>
              </form>

              <p className="mt-6 text-xs text-muted text-center">
                By signing up you agree to our <Link href="/terms" className="text-accent">Terms</Link> and{" "}
                <Link href="/privacy" className="text-accent">Privacy</Link>.
              </p>
              <p className="mt-4 text-sm text-muted text-center">
                Already have an account? <Link href="/login" className="text-accent">Log in →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
