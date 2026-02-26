// POST localhost:3000/api/demo/blocking

import { inngest } from "@/inngest/client";

export async function POST() {
  await inngest.send({
    name: "demo/generate",
    data: {},
  });

  return Response.json({ state: "started" });
}
