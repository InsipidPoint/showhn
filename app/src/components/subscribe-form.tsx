"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribe } from "@/app/actions";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const result = await subscribe({ email, frequency });
    if (result.ok) {
      setStatus("success");
    } else {
      setError(result.error || "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="border border-border rounded-lg p-6 bg-card text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-primary"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>
        <p className="font-medium">You&apos;re on the list!</p>
        <p className="text-sm text-muted-foreground mt-1">
          Email digest is coming soon. We&apos;ll let you know when it&apos;s ready.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className="font-semibold flex items-center gap-2 mb-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        Get the digest in your inbox
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Email digest is coming soon — sign up to be notified when it launches.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <div className="flex gap-2">
          <div className="flex rounded-md border border-input overflow-hidden text-sm shrink-0">
            <button
              type="button"
              onClick={() => setFrequency("daily")}
              className={`px-3 py-1.5 transition-colors ${
                frequency === "daily"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setFrequency("weekly")}
              className={`px-3 py-1.5 transition-colors ${
                frequency === "weekly"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Weekly
            </button>
          </div>
          <Button type="submit" disabled={status === "loading"} className="shrink-0">
            {status === "loading" ? "Subscribing..." : "Subscribe"}
          </Button>
        </div>
      </form>
      {status === "error" && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}
    </div>
  );
}
