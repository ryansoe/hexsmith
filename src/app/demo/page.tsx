// localhost:3000/demo
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function DemoPage() {
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);

  const handleBlocking = async () => {
    setLoading(true);
    await fetch("/api/demo/blocking", { method: "POST" });
    setLoading(false);
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
    </div>
  );
}
