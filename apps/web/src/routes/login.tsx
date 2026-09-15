import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlobeIcon, GraduationCapIcon, MailIcon, PhoneIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HIGHLIGHTS = [
  "Admissions, attendance, fees & exams in one place",
  "Granular roles & permissions for every staff member",
  "Print-ready receipts, report cards & ID cards",
];

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen bg-muted/30">
      {/* Branding panel -- hidden on narrow screens, the login card carries a
          condensed version of this content there instead. */}
      <div className="brand-gradient relative hidden w-[42%] shrink-0 flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/15">
              <GraduationCapIcon className="size-5.5" />
            </div>
            <span className="text-2xl font-semibold tracking-tight">Vidyalaya</span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-white/80">
            Online, multi-branch school management software -- admissions to report cards, all in one place.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-white/90">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/70" />
                {highlight}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
          <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Contact us</p>
          <a href="mailto:contact@vsen.ai" className="flex items-center gap-2 text-sm hover:underline">
            <MailIcon className="size-4" />
            contact@vsen.ai
          </a>
          <a href="tel:+919696947079" className="flex items-center gap-2 text-sm hover:underline">
            <PhoneIcon className="size-4" />
            +91 96969 47079
          </a>
          <a
            href="https://www.vsen.ai/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm hover:underline"
          >
            <GlobeIcon className="size-4" />
            www.vsen.ai
          </a>
          <div className="mt-1 flex items-center gap-2 border-t border-white/15 pt-3 text-xs text-white/60">
            <img src="/vsen-logo.png" alt="" className="size-4 shrink-0 object-contain" />
            A product of VSEN
          </div>
        </div>
      </div>

      {/* Login form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader className="items-center text-center">
              <GraduationCapIcon className="mb-2 size-10 text-primary lg:hidden" />
              <CardTitle className="text-xl">Sign in to Vidyalaya</CardTitle>
              <CardDescription>Use your school admin account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={isSubmitting} className="mt-2">
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Requires an internet connection to sign in and while you use Vidyalaya.
                </p>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <img src="/vsen-logo.png" alt="" className="size-3.5 shrink-0 object-contain" />
              A product of{" "}
              <a
                href="https://www.vsen.ai/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                VSEN
              </a>
            </div>
            <p className="text-xs text-muted-foreground lg:hidden">
              Need help?{" "}
              <a href="mailto:contact@vsen.ai" className="hover:underline">
                contact@vsen.ai
              </a>{" "}
              ·{" "}
              <a href="tel:+919696947079" className="hover:underline">
                +91 96969 47079
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
