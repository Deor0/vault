"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction, type AuthFormState } from "../_lib/auth-actions";

type FieldName = "name" | "email" | "password" | "confirmPassword";

interface FieldProps {
  name: FieldName;
  label: string;
  type: string;
  autoComplete: string;
  state: AuthFormState;
  required?: boolean;
  hint?: string;
}

function Field({ name, label, type, autoComplete, state, required = true, hint }: FieldProps) {
  const error = state.fieldErrors?.[name];
  const defaultValue = name === "name" || name === "email" ? state.values?.[name] : undefined;
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        // Remount with the echoed value after a failed submit (React resets uncontrolled forms).
        key={defaultValue ?? ""}
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={`${name}-error`} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Email + password form for sign-in and sign-up, with server-side validation messages. */
export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "signin" ? signInAction : signUpAction,
    {},
  );

  return (
    <form action={formAction} className="auth-form" noValidate>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      {mode === "signup" ? (
        <Field name="name" label="Name (optional)" type="text" autoComplete="name" state={state} required={false} />
      ) : null}
      <Field name="email" label="Email" type="email" autoComplete="email" state={state} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        state={state}
        hint={mode === "signup" ? "At least 8 characters." : undefined}
      />
      {mode === "signup" ? (
        <Field
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          state={state}
        />
      ) : null}

      <button type="submit" className="button primary block" disabled={pending}>
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create owner account"}
      </button>

      <p className="muted switch">
        {mode === "signin" ? (
          <>
            No account on this instance yet? <Link href="/signup">Create owner account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/signin">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
