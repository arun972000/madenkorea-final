'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

/* ---------- Strength helpers (no external libs) ---------- */
type Strength = { score: 0|1|2|3|4; label: string; tips: string[] };

function hasLower(s: string) { return /[a-z]/.test(s); }
function hasUpper(s: string) { return /[A-Z]/.test(s); }
function hasNumber(s: string) { return /\d/.test(s); }
function hasSymbol(s: string) { return /[^A-Za-z0-9\s]/.test(s); }
function hasSequence(s: string) { return /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i.test(s); }
function hasRepeat(s: string) { return /(.)\1{2,}/.test(s); }

function scorePassword(pw: string): Strength {
  const tips: string[] = [];
  if (!pw) return { score: 0, label: 'Too weak', tips: ['Use at least 8 characters'] };

  let score = 0;

  // length points
  if (pw.length >= 15) score += 3;
  else if (pw.length >= 11) score += 2;
  else if (pw.length >= 8) score += 1;

  // variety
  const varieties = [hasLower(pw), hasUpper(pw), hasNumber(pw), hasSymbol(pw)].filter(Boolean).length;
  score += Math.max(0, varieties - 1); // +0..+3

  // penalties
  if (hasSequence(pw)) score -= 1;
  if (hasRepeat(pw)) score -= 1;

  score = Math.max(0, Math.min(4, score));
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'] as const;

  if (pw.length < 12) tips.push('Make it longer (12+ chars)');
  if (!hasUpper(pw)) tips.push('Add uppercase letter');
  if (!hasNumber(pw)) tips.push('Add a number');
  if (!hasSymbol(pw)) tips.push('Add a symbol');
  if (hasSequence(pw)) tips.push('Avoid common sequences (1234, abcd)');
  if (hasRepeat(pw)) tips.push('Avoid repeated characters');

  return { score: score as 0|1|2|3|4, label: labels[score], tips };
}

function segClass(active: boolean, idx: number, score: number) {
  if (!active) return 'bg-muted';
  return [
    'bg-red-500',
    score >= 2 ? 'bg-orange-500' : 'bg-red-500',
    score >= 3 ? 'bg-yellow-500' : 'bg-orange-500',
    score >= 4 ? 'bg-emerald-500' : 'bg-yellow-500',
  ][idx];
}

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/account';

  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const peekPwTimeout = useRef<number | null>(null);
  const peekConfirmTimeout = useRef<number | null>(null);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);
  const meetsMin = form.password.length >= 8;
  const hasU = hasUpper(form.password);
  const hasN = hasNumber(form.password);
  const hasS = hasSymbol(form.password);
  const match = !!form.password && form.password === form.confirm;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const holdToPeek = (which: 'pw' | 'confirm', down: boolean) => {
    const setFn = which === 'pw' ? setShowPw : setShowConfirm;
    const timeoutRef = which === 'pw' ? peekPwTimeout : peekConfirmTimeout;

    if (down) {
      setFn(true);
      const id = window.setTimeout(() => setFn(false), 2000); // auto-hide after 2s
      if (which === 'pw') peekPwTimeout.current = id;
      else peekConfirmTimeout.current = id;
    } else {
      setFn(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agree) {
      toast.error('Please accept the Terms & Privacy Policy');
      return;
    }
    if (!meetsMin || !hasU || !hasN || !hasS) {
      toast.error('Please meet the minimum password requirements.');
      return;
    }
    if (!match) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const email = form.email.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: { full_name: form.full_name }, // used by our signup trigger to seed profiles
        emailRedirectTo: `${window.location.origin}/auth/login?verified=1`,
      },
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message || 'Could not create account');
      return;
    }

    // If email confirmation is ON, session will be null and an email was sent.
    if (!data.session) {
      toast.success('Check your inbox to verify your email.');
      router.replace('/auth/login?verify=1');
      return;
    }

    // If confirmation is OFF (dev), user is already signed in.
    toast.success('Account created!');
    router.replace(redirect);
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Create account</CardTitle>
            <CardDescription>Sign up with your email to get started</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  value={form.full_name}
                  onChange={onChange}
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={onChange}
                  placeholder="you@example.com"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={onChange}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPw(v => !v)}
                    onMouseDown={() => holdToPeek('pw', true)}
                    onMouseUp={() => holdToPeek('pw', false)}
                    onMouseLeave={() => holdToPeek('pw', false)}
                    onTouchStart={() => holdToPeek('pw', true)}
                    onTouchEnd={() => holdToPeek('pw', false)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    title="Click to toggle • Hold to peek"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Strength meter */}
                <div className="mt-2">
                  <div className="flex gap-1 h-2">
                    {[0,1,2,3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded ${segClass(i <= strength.score-1, i, strength.score)}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{strength.label}</span>
                    <span className="text-muted-foreground">{form.password.length} chars</span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      {meetsMin ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      At least 8 characters
                    </li>
                    <li className="flex items-center gap-1">
                      {hasU ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Uppercase letter
                    </li>
                    <li className="flex items-center gap-1">
                      {hasN ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Number
                    </li>
                    <li className="flex items-center gap-1">
                      {hasS ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Symbol
                    </li>
                  </ul>

                  {strength.score < 3 && strength.tips.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Try: {strength.tips.slice(0,3).join(' • ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Confirm */}
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={form.confirm}
                    onChange={onChange}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowConfirm(v => !v)}
                    onMouseDown={() => holdToPeek('confirm', true)}
                    onMouseUp={() => holdToPeek('confirm', false)}
                    onMouseLeave={() => holdToPeek('confirm', false)}
                    onTouchStart={() => holdToPeek('confirm', true)}
                    onTouchEnd={() => holdToPeek('confirm', false)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    title="Click to toggle • Hold to peek"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {form.confirm.length > 0 && (
                  <p className={`text-xs mt-1 ${match ? 'text-emerald-600' : 'text-destructive'}`}>
                    {match ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox id="agree" checked={agree} onCheckedChange={(v: any) => setAgree(!!v)} />
                <label htmlFor="agree" className="text-sm text-muted-foreground">
                  I agree to the <Link href="/legal/terms" className="text-primary hover:underline">Terms</Link> and{' '}
                  <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                </label>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create account'}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link href={`/auth/login?redirect=${encodeURIComponent(redirect)}`} className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
