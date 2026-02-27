// localhost:3000/demo
"use client";

import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

export default function DemoPage() {
  const { userId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);

  const handleBlocking = async () => {
    setLoading(true);
    await fetch("/api/demo/blocking", { method: "POST" });
    setLoading(false);
  };

  const handleClientError = () => {
    Sentry.logger.info("User attempting to click on client function", {
      userId,
    });
    throw new Error("Client error: Something went wrong in the browser!");
  };

  const handleApiError = async () => {
    await fetch("/api/demo/error", { method: "POST" });
  };

  const handleInngestError = async () => {
    await fetch("/api/demo/inngest-error", { method: "POST" });
  };

  const handleBackground = async () => {
    setBackgroundLoading(true);
    await fetch("/api/demo/background", { method: "POST" });
    setBackgroundLoading(false);
  };

  return (
    <div className="p-9 space-x-4">
      <Button onClick={handleBlocking} disabled={loading}>
        {loading ? "Loading..." : "Blocking"}
      </Button>
      <Button onClick={handleBackground} disabled={backgroundLoading}>
        {backgroundLoading ? "Loading..." : "Background"}
      </Button>
      <Button onClick={handleClientError} variant="destructive">
        Client Error
      </Button>
      <Button onClick={handleApiError} variant="destructive">
        API Error
      </Button>
      <Button onClick={handleInngestError} variant="destructive">
        Inngest Error
      </Button>
    </div>
  );
}
